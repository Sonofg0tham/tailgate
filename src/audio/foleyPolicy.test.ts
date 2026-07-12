import { describe, expect, it } from 'vitest';
import { BadgeAttemptEdges, sampleBusFor, worldFoleyTreatment } from './foleyPolicy';

describe('world foley geometry', () => {
  it('derives distance gain, pan and wall filtering from source and listener positions', () => {
    const open = worldFoleyTreatment(500, 0, 0, 0, false, 600);
    const blocked = worldFoleyTreatment(500, 0, 0, 0, true, 600);
    expect(open.pan).toBeGreaterThan(0);
    expect(open.gain).toBeGreaterThan(0);
    expect(blocked.gain).toBe(open.gain);
    expect(blocked.cutoffHz).toBeLessThan(open.cutoffHz);
    expect(worldFoleyTreatment(700, 0, 0, 0, false, 600).gain).toBe(0);
  });
});

describe('sample bus policy', () => {
  it('routes player steps, guard steps and interactions to distinct buses', () => {
    expect(sampleBusFor('player-step')).toBe('footsteps');
    expect(sampleBusFor('guard-step')).toBe('guard');
    expect(sampleBusFor('interaction')).toBe('foley');
  });
});

describe('badge approach edges', () => {
  it('fires once on entry and rearms only after leaving range', () => {
    const edges = new BadgeAttemptEdges();
    expect(edges.entered('staff:door', true)).toBe(true);
    expect(edges.entered('staff:door', true)).toBe(false);
    expect(edges.entered('staff:door', false)).toBe(false);
    expect(edges.entered('staff:door', true)).toBe(true);
  });
});
