import { alertTensionProfile } from './atmospherePolicy';
import { playClick, playToneBurst } from './synth';

/** Schedules the next alert pulse. CALM returns without producing a node. */
export function updateTensionBed(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  alertLevel: number,
  nowMs: number,
  nextPulseAtMs: number
): number {
  const profile = alertTensionProfile(alertLevel);
  if (!profile) return 0;
  if (nextPulseAtMs > nowMs) return nextPulseAtMs;
  playToneBurst(ctx, destination, {
    type: 'sine', frequencyHz: profile.droneHz, attackMs: 80, holdMs: 120,
    releaseMs: profile.pulseIntervalMs * 0.55, peakGain: 0.13,
  });
  playToneBurst(ctx, destination, {
    type: 'triangle', frequencyHz: profile.pulseHz, attackMs: 8, holdMs: 45,
    releaseMs: 180, peakGain: 0.12,
  });
  if (profile.filteredNoise) {
    playClick(ctx, destination, noiseBuffer, { cutoffHz: 420, peakGain: 0.06, durationMs: 230 });
  }
  return nowMs + profile.pulseIntervalMs;
}
