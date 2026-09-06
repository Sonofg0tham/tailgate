import { describe, expect, it } from 'vitest';
import { projectToScreenEdge } from './screenEdge';

describe('projectToScreenEdge', () => {
  it('reports an on-screen point as on screen and leaves it where it is', () => {
    const p = projectToScreenEdge(300, 200, 960, 540, 26);
    expect(p.onScreen).toBe(true);
    expect(p.x).toBeCloseTo(300);
    expect(p.y).toBeCloseTo(200);
  });

  it('pins a point far to the right onto the right border', () => {
    const p = projectToScreenEdge(5000, 270, 960, 540, 26);
    expect(p.onScreen).toBe(false);
    expect(p.x).toBeCloseTo(960 - 26);
    expect(p.y).toBeCloseTo(270);
    expect(p.angle).toBeCloseTo(0);
  });

  it('pins a point far above onto the top border', () => {
    const p = projectToScreenEdge(480, -3000, 960, 540, 26);
    expect(p.y).toBeCloseTo(26);
    expect(p.x).toBeCloseTo(480);
    expect(p.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('respects a deeper inset on one side', () => {
    const insets = { left: 32, right: 32, top: 90, bottom: 64 };
    const above = projectToScreenEdge(480, -3000, 960, 540, insets);
    expect(above.y).toBeCloseTo(90);
    const below = projectToScreenEdge(480, 5000, 960, 540, insets);
    expect(below.y).toBeCloseTo(540 - 64);
    const right = projectToScreenEdge(5000, 270, 960, 540, insets);
    expect(right.x).toBeCloseTo(960 - 32);
  });

  it('keeps a diagonal target inside both insets', () => {
    const p = projectToScreenEdge(-4000, -4000, 960, 540, 30);
    expect(p.x).toBeGreaterThanOrEqual(30);
    expect(p.y).toBeGreaterThanOrEqual(30);
    // The shorter axis (height) binds first, so the marker lands on the top edge.
    expect(p.y).toBeCloseTo(30);
  });
});
