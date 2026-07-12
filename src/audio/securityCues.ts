import type { SecurityCue } from './audioPolicy';
import { playClick, playToneBurst } from './synth';

export interface SecurityCueSignature {
  frequencyHz: number;
  type: OscillatorType;
  durationMs: number;
  noise: boolean;
}

const SIGNATURES: Record<SecurityCue, SecurityCueSignature> = {
  'guard-curious': { frequencyHz: 330, type: 'triangle', durationMs: 180, noise: false },
  'guard-alert': { frequencyHz: 185, type: 'sawtooth', durationMs: 310, noise: true },
  'camera-ping': { frequencyHz: 880, type: 'sine', durationMs: 90, noise: false },
  'camera-alarm': { frequencyHz: 740, type: 'square', durationMs: 360, noise: true },
};

export function securityCueSignature(cue: SecurityCue): SecurityCueSignature {
  return SIGNATURES[cue];
}

export interface SecurityCueRoute { gain: number; pan: number; cutoffHz: number }
export interface SecurityCueLayer extends SecurityCueRoute { kind: 'tone' | 'noise' }

export function securityCueLayers(cue: SecurityCue, route: SecurityCueRoute): SecurityCueLayer[] {
  const layers: SecurityCueLayer[] = [{ kind: 'tone', ...route }];
  if (securityCueSignature(cue).noise) layers.push({ kind: 'noise', ...route });
  return layers;
}

export function playSecurityCue(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  cue: SecurityCue,
  gain: number,
  pan: number,
  cutoffHz: number
): void {
  const signature = securityCueSignature(cue);
  const layers = securityCueLayers(cue, { gain, pan, cutoffHz });
  const route = layers[0];
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = route.cutoffHz;
  const spatialGain = ctx.createGain();
  spatialGain.gain.value = route.gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = route.pan;
  filter.connect(spatialGain);
  spatialGain.connect(panner);
  panner.connect(destination);

  playToneBurst(ctx, filter, {
    type: signature.type,
    frequencyHz: signature.frequencyHz,
    attackMs: 3,
    holdMs: signature.durationMs / 3,
    releaseMs: (signature.durationMs * 2) / 3,
    peakGain: 0.3,
  });
  if (layers.some((layer) => layer.kind === 'noise')) {
    playClick(ctx, filter, noiseBuffer, {
      cutoffHz: 12000,
      peakGain: 0.18,
      durationMs: signature.durationMs / 2,
    });
  }
  window.setTimeout(() => {
    filter.disconnect();
    spatialGain.disconnect();
    panner.disconnect();
  }, signature.durationMs + 150);
}
