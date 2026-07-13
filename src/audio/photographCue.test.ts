import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config/audio';

describe('photograph confirmation cue', () => {
  it('is a short, restrained interaction click', () => {
    const cue = (AUDIO as unknown as {
      photograph?: { cutoffHz: number; peakGain: number; durationMs: number };
    }).photograph;

    expect(cue).toBeDefined();
    expect(cue?.durationMs).toBeLessThanOrEqual(50);
    expect(cue?.peakGain).toBeLessThanOrEqual(0.18);
    expect(cue?.cutoffHz).toBeGreaterThanOrEqual(3000);
  });
});
