import Phaser from 'phaser';
import { AUDIO, type AmbienceBed, type Surface } from '../config/audio';
import { makeNoiseBuffer, playClick, playFilteredNoiseBurst, playToneBurst } from './synth';
import { zoneAt } from './zoneAt';
import type { ZoneRect, WallRect } from '../world/BuildingMap';
import type { SpeedState } from '../input/InputState';
import type { GuardState } from '../entities/Guard';
import { venueProfile, type LevelAudioProfile, type VenueProfileId } from './atmospherePolicy';
import type { SecurityCue } from './audioPolicy';
import { SecurityCueCoordinator } from './securityCueCoordinator';
import { playSecurityCue } from './securityCues';
import { updateTensionBed } from './tensionBed';
import { updateVenueDetail } from './venueAtmosphere';
import {
  chooseOcclusionCutoff,
  distanceGain,
  isActuallyMoving,
  panForPositions,
} from './audioPolicy';
import {
  buildMixCore,
  rampGain,
  SharedMixLifecycle,
  type MixCore,
} from './sharedMix';

/**
 * One frame's worth of world state the audio subsystem needs to decide what
 * to play. The scene builds this from the same data it feeds the renderer,
 * so AudioManager never touches Phaser game objects directly, only numbers.
 */
export interface AudioFrame {
  nowMs: number;
  player: { x: number; y: number; velocityX: number; velocityY: number };
  guard: {
    id: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    state: GuardState;
  } | null;
  playerSpeed: SpeedState;
  zones: ZoneRect[];
  walls: WallRect[];
  closedDoorRects: WallRect[];
  alertLevel: number;
  venueAudio?: LevelAudioProfile;
}

interface CueSpatialFrame {
  sourceX: number;
  sourceY: number;
  playerX: number;
  playerY: number;
  walls: WallRect[];
  closedDoors: WallRect[];
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
interface AudioGraph extends MixCore {
  noiseBuffer: AudioBuffer;
  ambienceVoices: Partial<Record<AmbienceBed, AmbienceVoice>>;
  ambienceGains: Partial<Record<AmbienceBed, GainNode>>;
  activeBed: AmbienceBed;
  venueVoices: Record<VenueProfileId, AmbienceVoice>;
  activeVenue: VenueProfileId | null;
}

let graph: AudioGraph | null = null;

/**
 * Sets the overall volume, 0 to 1, on top of the tuned master gain. Safe before
 * audio unlocks: the value is stored and applied when the graph is built.
 */
export function setAudioMasterVolume(v01: number): void {
  sharedMix.setMasterVolume(v01);
}

/** Mutes or unmutes the whole mix with a short click-free ramp. */
export function setAudioMuted(muted: boolean): void {
  sharedMix.setMuted(muted);
}

/** Ducks the shared graph while gameplay is paused, without rebuilding it. */
export function setAudioGameplayPaused(paused: boolean): void {
  sharedMix.setGameplayPaused(paused);
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
function buildGraph(ctx: AudioContext, gameplayPaused: boolean): AudioGraph {
  const mix = buildMixCore(ctx, gameplayPaused);

  const noiseBuffer = makeNoiseBuffer(ctx, 2);

  const beds: AmbienceBed[] = ['hvac', 'office', 'kitchen', 'server', 'dock'];
  const ambienceVoices: Partial<Record<AmbienceBed, AmbienceVoice>> = {};
  const ambienceGains: Partial<Record<AmbienceBed, GainNode>> = {};
  for (const bed of beds) {
    const voice = buildAmbienceVoice(ctx, noiseBuffer, bed);
    if (voice) {
      voice.gain.connect(mix.buses.ambience.gain);
      voice.gain.gain.value = 0;
      ambienceVoices[bed] = voice;
      ambienceGains[bed] = voice.gain;
    }
  }

  const venueBeds: Record<VenueProfileId, AmbienceBed> = {
    'building-c': 'office',
    'data-centre': 'server',
    warehouse: 'dock',
  };
  const venueVoices = {} as Record<VenueProfileId, AmbienceVoice>;
  for (const [id, bed] of Object.entries(venueBeds) as [VenueProfileId, AmbienceBed][]) {
    const voice = buildAmbienceVoice(ctx, noiseBuffer, bed);
    if (!voice) throw new Error(`Venue ambience ${id} has no voice`);
    voice.gain.connect(mix.buses.ambience.gain);
    voice.gain.gain.value = 0;
    venueVoices[id] = voice;
  }

  return {
    ...mix,
    noiseBuffer,
    ambienceVoices,
    ambienceGains,
    activeBed: 'none',
    venueVoices,
    activeVenue: null,
  };
}

const sharedMix = new SharedMixLifecycle<AudioGraph>(buildGraph);

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
  private tensionNextPulseAt = 0;
  private venueNextDetailAt = 0;
  private readonly cueSpatial = new Map<SecurityCue, CueSpatialFrame>();
  private readonly securityCues = new SecurityCueCoordinator((cue) => this.playSecurity(cue));

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
      graph = sharedMix.getOrCreate(ctx);
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
    this.updateVenueProfile(frame.venueAudio);
    this.tensionNextPulseAt = updateTensionBed(
      graph.ctx, graph.buses.ambience.gain, graph.noiseBuffer, frame.alertLevel,
      frame.nowMs, this.tensionNextPulseAt
    );
    this.venueNextDetailAt = updateVenueDetail(
      graph.ctx, graph.buses.ambience.gain, graph.noiseBuffer, frame.venueAudio,
      frame.nowMs, this.venueNextDetailAt
    );
    this.securityCues.flush(frame.nowMs);
  }

  private updateVenueProfile(configured: LevelAudioProfile | undefined): void {
    if (!graph) return;
    const target = venueProfile(configured).profile;
    if (target === graph.activeVenue) return;
    if (graph.activeVenue) {
      rampGain(graph.ctx, graph.venueVoices[graph.activeVenue].gain.gain, 0, AUDIO.ambience.crossfadeMs);
    }
    rampGain(graph.ctx, graph.venueVoices[target].gain.gain, 0.28, AUDIO.ambience.crossfadeMs);
    graph.activeVenue = target;
  }

  /** Offers a fresh guard or camera transition to the 250ms severity window. */
  offerSecurityCue(cue: SecurityCue, nowMs: number, spatial: CueSpatialFrame): void {
    this.cueSpatial.set(cue, spatial);
    this.securityCues.offer(cue, nowMs);
  }

  private playSecurity(cue: SecurityCue): void {
    if (!graph || graph.ctx.state !== 'running') return;
    const spatial = this.cueSpatial.get(cue);
    if (!spatial) return;
    const range = 600;
    const distance = Math.hypot(spatial.sourceX - spatial.playerX, spatial.sourceY - spatial.playerY);
    const gain = distanceGain(distance, range);
    if (gain <= 0) return;
    const occluded = this.lineIsOccluded(
      spatial.sourceX, spatial.sourceY, spatial.playerX, spatial.playerY,
      spatial.walls, spatial.closedDoors
    );
    playSecurityCue(
      graph.ctx, graph.buses.sting.gain, graph.noiseBuffer, cue, gain,
      panForPositions(spatial.sourceX, spatial.playerX, 0, range),
      chooseOcclusionCutoff(occluded, 4800, 650)
    );
  }

  private updateFootsteps(dtMs: number, frame: AudioFrame, zoneName: string | null): void {
    if (
      frame.playerSpeed === 'idle' ||
      !isActuallyMoving(frame.player.velocityX, frame.player.velocityY)
    ) {
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
    this.lastOcclusionCutoffHz = chooseOcclusionCutoff(
      occluded,
      AUDIO.guardFootstep.occlusionOpenHz,
      AUDIO.guardFootstep.occlusionWallHz
    );

    this.updateGuardFootsteps(dtMs, frame, distance);
    this.updateRadio(frame, distance);
  }

  private updateGuardFootsteps(dtMs: number, frame: AudioFrame, distance: number): void {
    const hearingRange = AUDIO.guardFootstep.hearingRangePx;
    if (
      distance > hearingRange ||
      !frame.guard ||
      !isActuallyMoving(frame.guard.velocityX, frame.guard.velocityY)
    ) {
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
    const gain = distanceGain(distance, hearingRange);
    if (gain <= 0) {
      return;
    }

    playFilteredNoiseBurst(graph.ctx, graph.buses.guard.gain, graph.noiseBuffer, {
      cutoffHz: this.lastOcclusionCutoffHz,
      q: 0.8,
      peakGain: AUDIO.guardFootstep.peakGain * gain,
      decayMs: 90,
      pan: panForPositions(frame.guard.x, frame.player.x, 0, hearingRange),
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

    const proximityGain = distanceGain(distance, AUDIO.radio.proximityRangePx);
    playClick(graph.ctx, graph.buses.radio.gain, graph.noiseBuffer, {
      cutoffHz: AUDIO.radio.cutoffHz,
      peakGain: AUDIO.radio.peakGain * proximityGain,
      durationMs: AUDIO.radio.burstMs,
      pan: frame.guard
        ? panForPositions(frame.guard.x, frame.player.x, 0, AUDIO.radio.proximityRangePx)
        : 0,
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

  /**
   * Plays a security console cue: open (rising blip), freeze (mid blip) or
   * denied (a low double-knock). Audio is one of the three channels that
   * announce a looped feed, alongside the halted dashed cone and the ring pip.
   */
  playConsoleCue(kind: 'open' | 'freeze' | 'denied'): void {
    if (!graph || graph.ctx.state !== 'running') {
      return;
    }
    const cfg = AUDIO.console;
    const frequencyHz =
      kind === 'open' ? cfg.openHz : kind === 'freeze' ? cfg.freezeHz : cfg.deniedHz;
    playToneBurst(graph.ctx, graph.buses.sting.gain, {
      type: cfg.toneType,
      frequencyHz,
      attackMs: cfg.attackMs,
      holdMs: cfg.holdMs,
      releaseMs: cfg.releaseMs,
      peakGain: cfg.peakGain,
    });
    if (kind === 'denied') {
      playToneBurst(graph.ctx, graph.buses.sting.gain, {
        type: cfg.toneType,
        frequencyHz: frequencyHz * 0.75,
        attackMs: cfg.attackMs,
        holdMs: cfg.holdMs,
        releaseMs: cfg.releaseMs,
        peakGain: cfg.peakGain,
      });
    }
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
    this.tensionNextPulseAt = 0;
    this.venueNextDetailAt = 0;
    this.cueSpatial.clear();
  }
}
