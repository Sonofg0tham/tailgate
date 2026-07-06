import Phaser from 'phaser';
import { AUDIO, type AmbienceBed, type Surface } from '../config/audio';
import { makeNoiseBuffer, playClick, playFilteredNoiseBurst, playToneBurst } from './synth';
import { zoneAt } from './zoneAt';
import type { ZoneRect, WallRect } from '../world/BuildingMap';
import type { SpeedState } from '../input/InputState';
import type { GuardState } from '../entities/Guard';

/**
 * One frame's worth of world state the audio subsystem needs to decide what
 * to play. The scene builds this from the same data it feeds the renderer,
 * so AudioManager never touches Phaser game objects directly, only numbers.
 */
export interface AudioFrame {
  nowMs: number;
  player: { x: number; y: number };
  guard: { x: number; y: number; state: GuardState } | null;
  playerSpeed: SpeedState;
  zones: ZoneRect[];
  walls: WallRect[];
  closedDoorRects: WallRect[];
  alertLevel: number;
}

/** One category's node graph: a gain feeding the master bus. */
interface CategoryBus {
  gain: GainNode;
}

/** The ambience bed nodes for one bed type, so it can be faded independently. */
interface AmbienceVoice {
  gain: GainNode;
  stop: () => void;
}

/**
 * Module-scope audio graph, built once by the first autoplay unlock and reused
 * across scene restarts (a detain restart must never stack a second copy of
 * the ambience beds or open a second AudioContext). AudioManager instances
 * are cheap; this graph is the expensive singleton behind them.
 */
interface AudioGraph {
  ctx: AudioContext;
  masterGain: GainNode;
  buses: {
    sting: CategoryBus;
    footsteps: CategoryBus;
    guard: CategoryBus;
    radio: CategoryBus;
    ambience: CategoryBus;
  };
  noiseBuffer: AudioBuffer;
  ambienceVoices: Partial<Record<AmbienceBed, AmbienceVoice>>;
  ambienceGains: Partial<Record<AmbienceBed, GainNode>>;
  activeBed: AmbienceBed;
}

let graph: AudioGraph | null = null;

// Master volume and mute live at module scope alongside the graph singleton, so
// any scene (the settings menu, the building) can set them and they apply to the
// one shared mix, whether or not audio has unlocked yet.
let masterVolume01 = 1;
let masterMuted = false;

/** The effective master gain: zero when muted, else the tuned master times 0..1. */
function effectiveMasterGain(): number {
  return masterMuted ? 0 : AUDIO.volumes.master * masterVolume01;
}

/**
 * Sets the overall volume, 0 to 1, on top of the tuned master gain. Safe before
 * audio unlocks: the value is stored and applied when the graph is built.
 */
export function setAudioMasterVolume(v01: number): void {
  masterVolume01 = Phaser.Math.Clamp(v01, 0, 1);
  if (graph && !masterMuted) {
    graph.masterGain.gain.setValueAtTime(effectiveMasterGain(), graph.ctx.currentTime);
  }
}

/** Mutes or unmutes the whole mix with a short click-free ramp. */
export function setAudioMuted(muted: boolean): void {
  masterMuted = muted;
  if (graph) {
    rampGain(graph.ctx, graph.masterGain.gain, effectiveMasterGain(), 30);
  }
}

/** Builds one steady ambience voice for a bed, routed through its own gain. */
function buildAmbienceVoice(ctx: AudioContext, noiseBuffer: AudioBuffer, bed: AmbienceBed): AmbienceVoice | null {
  if (bed === 'none') {
    return null;
  }

  const stopFns: Array<() => void> = [];
  const nodes: AudioNode[] = [];
  const gain = ctx.createGain();
  gain.gain.value = 1;

  const connectNoise = (cutoffHz: number, q: number, level: number): void => {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    filter.Q.value = q;
    const level_ = ctx.createGain();
    level_.gain.value = level;
    source.connect(filter);
    filter.connect(level_);
    level_.connect(gain);
    source.start();
    nodes.push(source, filter, level_);
    stopFns.push(() => source.stop());
  };

  const connectDrone = (frequencyHz: number, type: OscillatorType, level: number): void => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequencyHz;
    const level_ = ctx.createGain();
    level_.gain.value = level;
    osc.connect(level_);
    level_.connect(gain);
    osc.start();
    nodes.push(osc, level_);
    stopFns.push(() => osc.stop());
  };

  switch (bed) {
    case 'hvac':
      connectNoise(320, 0.8, 0.5);
      connectDrone(60, 'sine', 0.15);
      break;
    case 'server':
      connectNoise(6500, 0.6, 0.55);
      connectDrone(220, 'sawtooth', 0.06);
      break;
    case 'dock':
      connectNoise(500, 0.5, 0.6);
      connectDrone(45, 'sine', 0.2);
      break;
    case 'kitchen':
      connectNoise(2000, 1.4, 0.25);
      connectDrone(880, 'sine', 0.05);
      break;
    case 'office':
      connectNoise(320, 0.8, 0.4);
      connectDrone(60, 'sine', 0.1);
      break;
    default:
      break;
  }

  return {
    gain,
    stop: () => {
      for (const stop of stopFns) {
        stop();
      }
      for (const node of nodes) {
        node.disconnect();
      }
      gain.disconnect();
    },
  };
}

/** Builds the module-singleton audio graph. Called at most once per page life. */
function buildGraph(ctx: AudioContext): AudioGraph {
  const masterGain = ctx.createGain();
  masterGain.gain.value = AUDIO.volumes.master;
  masterGain.connect(ctx.destination);

  const makeBus = (volume: number): CategoryBus => {
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(masterGain);
    return { gain };
  };

  const buses = {
    sting: makeBus(AUDIO.volumes.sting),
    footsteps: makeBus(AUDIO.volumes.footsteps),
    guard: makeBus(AUDIO.volumes.guard),
    radio: makeBus(AUDIO.volumes.radio),
    ambience: makeBus(AUDIO.volumes.ambience),
  };

  const noiseBuffer = makeNoiseBuffer(ctx, 2);

  const beds: AmbienceBed[] = ['hvac', 'office', 'kitchen', 'server', 'dock'];
  const ambienceVoices: Partial<Record<AmbienceBed, AmbienceVoice>> = {};
  const ambienceGains: Partial<Record<AmbienceBed, GainNode>> = {};
  for (const bed of beds) {
    const voice = buildAmbienceVoice(ctx, noiseBuffer, bed);
    if (voice) {
      voice.gain.connect(buses.ambience.gain);
      voice.gain.gain.value = 0;
      ambienceVoices[bed] = voice;
      ambienceGains[bed] = voice.gain;
    }
  }

  return {
    ctx,
    masterGain,
    buses,
    noiseBuffer,
    ambienceVoices,
    ambienceGains,
    activeBed: 'none',
  };
}

/** Ramps a gain param to a target value over durationMs without clicking. */
function rampGain(ctx: AudioContext, param: AudioParam, target: number, durationMs: number): void {
  const now = ctx.currentTime;
  const safeTarget = Math.max(target, 0);
  param.cancelScheduledValues(now);
  const current = Math.max(param.value, 0.0001);
  param.setValueAtTime(current, now);
  if (safeTarget <= 0.0001) {
    param.linearRampToValueAtTime(0.0001, now + durationMs / 1000);
    param.setValueAtTime(0, now + durationMs / 1000);
  } else {
    param.exponentialRampToValueAtTime(safeTarget, now + durationMs / 1000);
  }
}

/**
 * Owns Tailgate's procedural soundscape: footsteps, guard audio cues, radio
 * chatter, ambience beds and the alert sting, all synthesised at runtime with
 * Web Audio, no sound assets. The instance is cheap to construct; the actual
 * AudioContext and node graph live in module scope and are created lazily on
 * the first user gesture, per browser autoplay rules, and survive scene
 * restarts (a detain restart must not open a second context or stack a
 * second ambience bed).
 */
export class AudioManager {
  private stingCount = 0;

  private lastFrameMs: number | null = null;
  private stepAccumulatorMs = 0;
  private guardStepAccumulatorMs = 0;
  private radioNextBurstAt = 0;

  private lastOcclusionCutoffHz: number = AUDIO.guardFootstep.occlusionOpenHz;
  private lastGuardDistancePx = Number.POSITIVE_INFINITY;

  /** Cheap by design: no audio nodes, no AudioContext, allocated here. */
  constructor() {
    // Intentionally empty. All graph construction happens lazily in unlock().
  }

  /** Arms one-time autoplay unlockers. Safe to call every scene create(). */
  init(scene: Phaser.Scene): void {
    if (graph && graph.ctx.state === 'running') {
      // Graph already up and running, nothing to arm.
      return;
    }

    const unlock = (): void => {
      this.unlockAudio();
    };

    scene.input.once('pointerdown', unlock);
    scene.input.keyboard?.once('keydown', unlock);
  }

  private unlockAudio(): void {
    const AudioCtor = window.AudioContext;
    if (!AudioCtor) {
      return;
    }

    if (!graph) {
      const ctx = new AudioCtor();
      graph = buildGraph(ctx);
      graph.masterGain.gain.value = effectiveMasterGain();
    }

    if (graph.ctx.state === 'suspended') {
      void graph.ctx.resume();
    }
  }

  /** True once the AudioContext exists and is running. */
  get isRunning(): boolean {
    return graph !== null && graph.ctx.state === 'running';
  }

  /** How many times playAlertSting has fired this page life. */
  get stingsFired(): number {
    return this.stingCount;
  }

  /** The ambience bed currently faded in (may be mid-crossfade to it). */
  get activeAmbience(): AmbienceBed {
    return graph?.activeBed ?? 'none';
  }

  /** Last low-pass cutoff applied to guard footsteps, for debug overlays. */
  get occlusionCutoffHz(): number {
    return this.lastOcclusionCutoffHz;
  }

  /** Last computed guard-to-player distance in pixels, for debug overlays. */
  get guardDistancePx(): number {
    return this.lastGuardDistancePx;
  }

  update(frame: AudioFrame): void {
    const dtMs = this.lastFrameMs === null ? 0 : Math.max(0, frame.nowMs - this.lastFrameMs);
    this.lastFrameMs = frame.nowMs;

    if (!graph || graph.ctx.state !== 'running') {
      return;
    }

    const zoneName = zoneAt(frame.zones, frame.player.x, frame.player.y);
    this.updateFootsteps(dtMs, frame, zoneName);
    this.updateGuardAudio(dtMs, frame);
    this.updateAmbience(dtMs, zoneName, frame.alertLevel);
  }

  private updateFootsteps(dtMs: number, frame: AudioFrame, zoneName: string | null): void {
    if (frame.playerSpeed === 'idle') {
      this.stepAccumulatorMs = 0;
      return;
    }

    this.stepAccumulatorMs += dtMs;
    const intervalMs = AUDIO.stepIntervalMs[frame.playerSpeed];
    if (this.stepAccumulatorMs >= intervalMs) {
      this.stepAccumulatorMs -= intervalMs;
      const surface: Surface = AUDIO.zoneSurface[zoneName ?? ''] ?? 'concrete';
      this.playFootstep(surface);
    }
  }

  private updateGuardAudio(dtMs: number, frame: AudioFrame): void {
    if (!frame.guard) {
      this.lastGuardDistancePx = Number.POSITIVE_INFINITY;
      return;
    }

    const distance = Math.hypot(frame.guard.x - frame.player.x, frame.guard.y - frame.player.y);
    this.lastGuardDistancePx = distance;

    const occluded = this.lineIsOccluded(
      frame.guard.x,
      frame.guard.y,
      frame.player.x,
      frame.player.y,
      frame.walls,
      frame.closedDoorRects
    );
    this.lastOcclusionCutoffHz = occluded
      ? AUDIO.guardFootstep.occlusionWallHz
      : AUDIO.guardFootstep.occlusionOpenHz;

    this.updateGuardFootsteps(dtMs, distance);
    this.updateRadio(frame, distance);
  }

  private updateGuardFootsteps(dtMs: number, distance: number): void {
    const hearingRange = AUDIO.guardFootstep.hearingRangePx;
    if (distance > hearingRange) {
      this.guardStepAccumulatorMs = 0;
      return;
    }

    this.guardStepAccumulatorMs += dtMs;
    if (this.guardStepAccumulatorMs < AUDIO.guardFootstep.stepIntervalMs) {
      return;
    }
    this.guardStepAccumulatorMs -= AUDIO.guardFootstep.stepIntervalMs;

    if (!graph) {
      return;
    }
    const distanceGain = Phaser.Math.Clamp(1 - distance / hearingRange, 0, 1);
    if (distanceGain <= 0) {
      return;
    }

    playFilteredNoiseBurst(graph.ctx, graph.buses.guard.gain, graph.noiseBuffer, {
      cutoffHz: this.lastOcclusionCutoffHz,
      q: 0.8,
      peakGain: AUDIO.guardFootstep.peakGain * distanceGain,
      decayMs: 90,
    });
  }

  private updateRadio(frame: AudioFrame, distance: number): void {
    if (distance > AUDIO.radio.proximityRangePx) {
      // Out of range: push the next burst out so re-entering range does not
      // fire immediately on a stale timer.
      this.radioNextBurstAt = frame.nowMs + AUDIO.radio.burstEveryMinMs;
      return;
    }

    if (this.radioNextBurstAt === 0) {
      this.radioNextBurstAt = frame.nowMs + AUDIO.radio.burstEveryMinMs;
      return;
    }

    if (frame.nowMs < this.radioNextBurstAt) {
      return;
    }

    if (!graph) {
      return;
    }

    const proximityGain = Phaser.Math.Clamp(
      1 - distance / AUDIO.radio.proximityRangePx,
      0,
      1
    );
    playClick(graph.ctx, graph.buses.radio.gain, graph.noiseBuffer, {
      cutoffHz: AUDIO.radio.cutoffHz,
      peakGain: AUDIO.radio.peakGain * proximityGain,
      durationMs: AUDIO.radio.burstMs,
    });

    const span = AUDIO.radio.burstEveryMaxMs - AUDIO.radio.burstEveryMinMs;
    this.radioNextBurstAt = frame.nowMs + AUDIO.radio.burstEveryMinMs + Math.random() * span;
  }

  private updateAmbience(dtMs: number, zoneName: string | null, alertLevel: number): void {
    if (!graph) {
      return;
    }

    const targetBed: AmbienceBed = AUDIO.zoneAmbience[zoneName ?? ''] ?? 'none';
    const duck = alertLevel >= 2 ? 0.7 : 1;

    if (targetBed !== graph.activeBed) {
      const previousBed = graph.activeBed;
      const previousGain = graph.ambienceGains[previousBed];
      if (previousGain) {
        rampGain(graph.ctx, previousGain.gain, 0, AUDIO.ambience.crossfadeMs);
      }
      const nextGain = graph.ambienceGains[targetBed];
      if (nextGain) {
        rampGain(graph.ctx, nextGain.gain, duck, AUDIO.ambience.crossfadeMs);
      }
      graph.activeBed = targetBed;
      return;
    }

    // Same bed: just track the lockdown duck smoothly, small nudge only.
    const activeGain = graph.ambienceGains[graph.activeBed];
    if (activeGain) {
      const dtSec = dtMs / 1000;
      const current = activeGain.gain.value;
      const nudged = Phaser.Math.Linear(current, duck, Math.min(1, dtSec * 2));
      activeGain.gain.setValueAtTime(nudged, graph.ctx.currentTime);
    }
  }

  /** True if any wall or closed door blocks the straight line from a to b. */
  private lineIsOccluded(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    walls: WallRect[],
    closedDoorRects: WallRect[]
  ): boolean {
    const line = new Phaser.Geom.Line(ax, ay, bx, by);
    for (const wall of walls) {
      const rect = new Phaser.Geom.Rectangle(wall.x, wall.y, wall.width, wall.height);
      if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) {
        return true;
      }
    }
    for (const door of closedDoorRects) {
      const rect = new Phaser.Geom.Rectangle(door.x, door.y, door.width, door.height);
      if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) {
        return true;
      }
    }
    return false;
  }

  /** Plays a single alert sting: two dissonant square tones plus a noise tick. */
  playAlertSting(): void {
    this.stingCount += 1;
    if (!graph || graph.ctx.state !== 'running') {
      return;
    }

    const { ctx, buses, noiseBuffer } = graph;
    const sting = AUDIO.sting;

    playToneBurst(ctx, buses.sting.gain, {
      type: sting.toneType,
      frequencyHz: sting.toneAHz,
      attackMs: sting.attackMs,
      holdMs: sting.holdMs,
      releaseMs: sting.releaseMs,
      peakGain: sting.peakGain,
    });
    playToneBurst(ctx, buses.sting.gain, {
      type: sting.toneType,
      frequencyHz: sting.toneBHz,
      attackMs: sting.attackMs,
      holdMs: sting.holdMs,
      releaseMs: sting.releaseMs,
      peakGain: sting.peakGain,
    });
    playClick(ctx, buses.sting.gain, noiseBuffer, {
      cutoffHz: sting.tickCutoffHz,
      peakGain: sting.peakGain,
      durationMs: sting.tickMs,
    });
  }

  /** Plays one player footstep for the given floor surface. */
  playFootstep(surface: Surface): void {
    if (!graph || graph.ctx.state !== 'running') {
      return;
    }
    const settings = AUDIO.footstep[surface];
    playFilteredNoiseBurst(graph.ctx, graph.buses.footsteps.gain, graph.noiseBuffer, {
      cutoffHz: settings.cutoffHz,
      q: settings.q,
      peakGain: settings.peakGain,
      decayMs: settings.decayMs,
    });
  }

  /**
   * Called before a detain restart. The graph and ambience beds are module
   * scoped and must survive the scene restart untouched, so this only resets
   * this instance's per-frame timers rather than touching any audio nodes.
   */
  suspendForRestart(): void {
    this.lastFrameMs = null;
    this.stepAccumulatorMs = 0;
    this.guardStepAccumulatorMs = 0;
    this.radioNextBurstAt = 0;
  }
}
