import { describe, expect, it } from 'vitest';
import { SAMPLE_MANIFEST } from './sampleManifest';
import { chooseVariant, guardStepPlaybackRate, sampleTreatment } from './samplePolicy';
import { SampleOwnership } from './sampleOwnership';

describe('hybrid sample manifest', () => {
  it('contains no more than 24 CC0 Kenney files with complete provenance', () => {
    expect(SAMPLE_MANIFEST.length).toBeLessThanOrEqual(24);
    expect(new Set(SAMPLE_MANIFEST.map((sample) => sample.path)).size).toBe(SAMPLE_MANIFEST.length);
    for (const sample of SAMPLE_MANIFEST) {
      expect(sample.author).toBe('Kenney');
      expect(sample.licence).toBe('CC0 1.0');
      expect(sample.sourceUrl).toMatch(/^https:\/\/kenney\.nl\/assets\//);
      expect(sample.sourceFilename.endsWith('.ogg')).toBe(true);
    }
  });

  it('provides four footstep choices for every runtime surface', () => {
    const paths = new Set<string>();
    for (const surface of ['carpet', 'tile', 'concrete'] as const) {
      const samples = SAMPLE_MANIFEST.filter((sample) => sample.groups.includes(`footstep:${surface}`));
      expect(samples).toHaveLength(4);
      for (const sample of samples) {
        expect(paths.has(sample.path)).toBe(false);
        paths.add(sample.path);
        expect(sample.groups).toEqual([`footstep:${surface}`]);
      }
    }
    expect(SAMPLE_MANIFEST).toHaveLength(24);
  });
});

describe('sample variation policy', () => {
  it('selects a deterministic variant within bounds', () => {
    expect(chooseVariant(4, 0)).toBe(0);
    expect(chooseVariant(4, 0.999)).toBe(3);
    expect(chooseVariant(4, 0.5)).toBe(2);
  });

  it('keeps pitch and pan inside restrained limits', () => {
    const low = sampleTreatment('carpet', 0, 0);
    const high = sampleTreatment('tile', 1, 1);
    expect(low.playbackRate).toBeGreaterThanOrEqual(0.94);
    expect(high.playbackRate).toBeLessThanOrEqual(1.06);
    expect(low.pan).toBeGreaterThanOrEqual(-0.18);
    expect(high.pan).toBeLessThanOrEqual(0.18);
    expect(low.cutoffHz).not.toBe(high.cutoffHz);
  });

  it('keeps guard step pitch variation restrained', () => {
    expect(guardStepPlaybackRate(0)).toBe(0.96);
    expect(guardStepPlaybackRate(1)).toBe(1.04);
  });
});

describe('restart-safe ownership', () => {
  it('replaces the scene owner and stops its old voices', () => {
    const ownership = new SampleOwnership();
    let stopped = 0;
    ownership.claim('building', { stop: () => stopped++ });
    ownership.claim('building', { stop: () => stopped++ });
    expect(stopped).toBe(1);
    ownership.release('building');
    expect(stopped).toBe(2);
  });

  it('integrates scene shutdown by stopping each owned sample once without a shared-bed owner', () => {
    const ownership = new SampleOwnership();
    let stopped = 0;
    let disconnected = 0;
    ownership.addVoice('building', {
      stop: () => stopped++,
      disconnect: () => disconnected++,
    });
    ownership.release('building');
    ownership.release('building');
    expect({ stopped, disconnected }).toEqual({ stopped: 1, disconnected: 1 });
  });
});
