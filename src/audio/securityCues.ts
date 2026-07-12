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
  playToneBurst(ctx, destination, {
    type: signature.type,
    frequencyHz: signature.frequencyHz,
    attackMs: 3,
    holdMs: signature.durationMs / 3,
    releaseMs: (signature.durationMs * 2) / 3,
    peakGain: 0.3 * gain,
    pan,
  });
  if (signature.noise) {
    playClick(ctx, destination, noiseBuffer, {
      cutoffHz,
      peakGain: 0.18 * gain,
      durationMs: signature.durationMs / 2,
      pan,
    });
  }
}
