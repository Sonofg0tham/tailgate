import type { LevelAudioProfile } from './atmospherePolicy';
import { venueProfile } from './atmospherePolicy';
import { playClick, playToneBurst } from './synth';

/** Adds a sparse venue-specific detail over the existing zone ambience. */
export function updateVenueDetail(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  configured: LevelAudioProfile | undefined,
  nowMs: number,
  nextDetailAtMs: number
): number {
  const profile = venueProfile(configured);
  if (nextDetailAtMs === 0) return scheduleNext(profile, nowMs);
  if (nowMs < nextDetailAtMs) return nextDetailAtMs;

  if (profile.detailCue === 'printer-kitchen') {
    playClick(ctx, destination, noiseBuffer, { cutoffHz: 2800, peakGain: 0.11, durationMs: 85 });
  } else if (profile.detailCue === 'relay-tick') {
    playClick(ctx, destination, noiseBuffer, { cutoffHz: 5200, peakGain: 0.09, durationMs: 35 });
  } else {
    playToneBurst(ctx, destination, {
      type: 'triangle', frequencyHz: 92, attackMs: 8, holdMs: 40, releaseMs: 420, peakGain: 0.08,
    });
  }
  return scheduleNext(profile, nowMs);
}

function scheduleNext(profile: LevelAudioProfile, nowMs: number): number {
  const span = Math.max(0, profile.detailEveryMaxMs - profile.detailEveryMinMs);
  return nowMs + profile.detailEveryMinMs + Math.random() * span;
}
