import type { Surface } from '../config/audio';

export function chooseVariant(count: number, random01: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.floor(Math.max(0, Math.min(0.999999, random01)) * count));
}

const SURFACE = {
  carpet: { cutoffHz: 1200, gain: 0.48 },
  tile: { cutoffHz: 7200, gain: 0.62 },
  concrete: { cutoffHz: 3400, gain: 0.58 },
} as const;

export function sampleTreatment(surface: Surface, pitchRandom01: number, panRandom01: number) {
  return {
    playbackRate: 0.94 + Math.max(0, Math.min(1, pitchRandom01)) * 0.12,
    pan: -0.18 + Math.max(0, Math.min(1, panRandom01)) * 0.36,
    ...SURFACE[surface],
  };
}

export function guardStepPlaybackRate(random01: number): number {
  return 0.96 + Math.max(0, Math.min(1, random01)) * 0.08;
}
