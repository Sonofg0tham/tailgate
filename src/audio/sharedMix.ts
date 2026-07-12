import { AUDIO } from '../config/audio';

export interface CategoryBus {
  gain: GainNode;
}

export interface MixCore {
  ctx: AudioContext;
  masterGain: GainNode;
  sharedGain: GainNode;
  compressor: DynamicsCompressorNode;
  buses: {
    sting: CategoryBus;
    footsteps: CategoryBus;
    guard: CategoryBus;
    radio: CategoryBus;
    ambience: CategoryBus;
  };
}

/** Builds the common bus chain with the compressor as the final safety node. */
export function buildMixCore(ctx: AudioContext, gameplayPaused: boolean): MixCore {
  const masterGain = ctx.createGain();
  masterGain.gain.value = AUDIO.volumes.master;
  const sharedGain = ctx.createGain();
  sharedGain.gain.value = gameplayPaused ? 0.0001 : AUDIO.volumes.headroom;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  sharedGain.connect(masterGain);
  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  const makeBus = (volume: number): CategoryBus => {
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(sharedGain);
    return { gain };
  };

  return {
    ctx,
    masterGain,
    sharedGain,
    compressor,
    buses: {
      sting: makeBus(AUDIO.volumes.sting),
      footsteps: makeBus(AUDIO.volumes.footsteps),
      guard: makeBus(AUDIO.volumes.guard),
      radio: makeBus(AUDIO.volumes.radio),
      ambience: makeBus(AUDIO.volumes.ambience),
    },
  };
}

/** Applies a click-free gain transition. */
export function rampGain(ctx: AudioContext, param: AudioParam, target: number, durationMs: number): void {
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

/** Owns one shared mix and its settings across gameplay scene restarts. */
export class SharedMixLifecycle<T extends MixCore> {
  private graph: T | null = null;
  private masterVolume01 = 1;
  private masterMuted = false;
  private gameplayPaused = false;

  constructor(private readonly build: (ctx: AudioContext, paused: boolean) => T) {}

  get current(): T | null {
    return this.graph;
  }

  getOrCreate(ctx: AudioContext): T {
    this.graph ??= this.build(ctx, this.gameplayPaused);
    this.graph.masterGain.gain.value = this.effectiveMasterGain();
    return this.graph;
  }

  setMasterVolume(volume01: number): void {
    this.masterVolume01 = Math.max(0, Math.min(1, volume01));
    if (this.graph && !this.masterMuted) {
      this.graph.masterGain.gain.setValueAtTime(
        this.effectiveMasterGain(),
        this.graph.ctx.currentTime
      );
    }
  }

  setMuted(muted: boolean): void {
    this.masterMuted = muted;
    if (this.graph) {
      rampGain(this.graph.ctx, this.graph.masterGain.gain, this.effectiveMasterGain(), 30);
    }
  }

  setGameplayPaused(paused: boolean): void {
    this.gameplayPaused = paused;
    if (this.graph) {
      rampGain(
        this.graph.ctx,
        this.graph.sharedGain.gain,
        paused ? 0.0001 : AUDIO.volumes.headroom,
        120
      );
    }
  }

  private effectiveMasterGain(): number {
    return this.masterMuted ? 0 : AUDIO.volumes.master * this.masterVolume01;
  }
}
