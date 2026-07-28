import { describe, expect, it } from 'vitest';
import { NavGrid, type NavPoint, type NavRect } from './NavGrid';

/**
 * Test grids are built with a zero body radius and a 20px cell, so the geometry
 * in each case is exactly what is written down. Play uses a 16px cell and a
 * 10px radius (see config/navigation.ts); the algorithms do not care which.
 */
const OPTIONS = { cellSizePx: 20, agentRadiusPx: 0 };
const WORLD = 400;

function gridWith(...walls: NavRect[]): NavGrid {
  return new NavGrid(WORLD, WORLD, walls, OPTIONS);
}

/**
 * Walks a finished path densely and reports whether it ever enters an
 * unwalkable cell. Deliberately independent of the grid's own line test, so a
 * bug in that test cannot make a bad path look fine.
 */
function pathTouchesBlocked(
  grid: NavGrid,
  startX: number,
  startY: number,
  points: readonly NavPoint[]
): boolean {
  let fromX = startX;
  let fromY = startY;
  for (const point of points) {
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - fromX, point.y - fromY) / 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (grid.isBlockedAt(fromX + (point.x - fromX) * t, fromY + (point.y - fromY) * t)) {
        return true;
      }
    }
    fromX = point.x;
    fromY = point.y;
  }
  return false;
}

/** A vertical wall with a gap along the bottom, so the only way past is round it. */
const SPLIT_WALL: NavRect = { x: 180, y: 0, width: 20, height: 300 };

/** A sealed room in the bottom-right corner, walls 20px thick. */
const SEALED_ROOM: NavRect[] = [
  { x: 280, y: 280, width: 120, height: 20 },
  { x: 280, y: 280, width: 20, height: 120 },
  { x: 280, y: 380, width: 120, height: 20 },
  { x: 380, y: 280, width: 20, height: 120 },
];

describe('nav grid geometry', () => {
  it('marks cells inside a wall unwalkable and leaves the rest alone', () => {
    const grid = gridWith(SPLIT_WALL);

    expect(grid.isBlockedAt(190, 150)).toBe(true);
    expect(grid.isBlockedAt(90, 150)).toBe(false);
    expect(grid.isBlockedAt(310, 150)).toBe(false);
    // Below the wall's bottom edge the way is open.
    expect(grid.isBlockedAt(190, 350)).toBe(false);
  });

  it('fattens walls by the body radius so a path cannot scrape a corner', () => {
    const tight = new NavGrid(WORLD, WORLD, [SPLIT_WALL], { cellSizePx: 20, agentRadiusPx: 12 });

    // 30px clear of the wall face is fine, 8px is not: a body would clip it.
    expect(tight.isBlockedAt(150, 150)).toBe(false);
    expect(tight.isBlockedAt(172, 150)).toBe(true);
  });

  it('reports a straight line clear only when nothing is in the way', () => {
    const grid = gridWith(SPLIT_WALL);

    expect(grid.hasClearLine(50, 150, 150, 150)).toBe(true);
    expect(grid.hasClearLine(50, 150, 350, 150)).toBe(false);
    expect(grid.hasClearLine(50, 350, 350, 350)).toBe(true);
  });
});

describe('nav grid pathfinding', () => {
  it('goes straight there when the way is clear', () => {
    const grid = gridWith();

    const path = grid.findPath(37, 43, 331, 289);

    expect(path).not.toBeNull();
    // Smoothing should collapse the whole run to a single waypoint: the goal.
    expect(path).toHaveLength(1);
    expect(path?.[0]).toEqual({ x: 331, y: 289 });
  });

  it('routes around a wall instead of through it', () => {
    const grid = gridWith(SPLIT_WALL);

    const path = grid.findPath(87, 143, 311, 143);

    expect(path).not.toBeNull();
    const points = path ?? [];
    // A dog-leg round the bottom of the wall, not a straight shot through it.
    expect(points.length).toBeGreaterThan(1);
    expect(points.some((point) => point.y > 300)).toBe(true);
    expect(points[points.length - 1]).toEqual({ x: 311, y: 143 });
    expect(pathTouchesBlocked(grid, 87, 143, points)).toBe(false);
  });

  it('smooths a route without ever cutting through a blocked cell', () => {
    const grid = gridWith(SPLIT_WALL, { x: 60, y: 200, width: 20, height: 200 });

    for (const goal of [
      { x: 311, y: 143 },
      { x: 331, y: 351 },
      { x: 31, y: 331 },
    ]) {
      const path = grid.findPath(87, 43, goal.x, goal.y);

      expect(path, `no path to ${goal.x},${goal.y}`).not.toBeNull();
      expect(pathTouchesBlocked(grid, 87, 43, path ?? [])).toBe(false);
    }
  });

  it('snaps a goal inside a wall out to the nearest spot a body fits', () => {
    const grid = gridWith(SPLIT_WALL);

    const path = grid.findPath(87, 143, 190, 143);

    expect(path).not.toBeNull();
    const last = (path ?? [])[(path ?? []).length - 1];
    expect(grid.isBlockedAt(last.x, last.y)).toBe(false);
    // Snapped, not abandoned: still right next to where it was asked to go.
    expect(Math.hypot(last.x - 190, last.y - 143)).toBeLessThan(60);
    expect(pathTouchesBlocked(grid, 87, 143, path ?? [])).toBe(false);
  });

  it('returns null when the destination is walled off entirely', () => {
    const grid = gridWith(...SEALED_ROOM);

    expect(grid.findPath(87, 43, 340, 340)).toBeNull();
  });

  it('returns a single waypoint when start and goal share a cell', () => {
    const grid = gridWith();

    expect(grid.findPath(101, 101, 108, 104)).toEqual([{ x: 108, y: 104 }]);
  });

  it('reuses the array it is handed instead of allocating a new one', () => {
    const grid = gridWith(SPLIT_WALL);
    const reused: NavPoint[] = [];

    const first = grid.findPath(87, 143, 311, 143, reused);
    const second = grid.findPath(87, 143, 311, 143, reused);

    expect(first).toBe(reused);
    expect(second).toBe(reused);
  });
});

describe('nav grid shut doors', () => {
  /** Two rooms joined by one 60px doorway at x 180 to 200, y 160 to 220. */
  const DOORWAY_WALLS: NavRect[] = [
    { x: 180, y: 0, width: 20, height: 160 },
    { x: 180, y: 220, width: 20, height: 180 },
  ];
  const SHUT_DOOR: NavRect = { x: 180, y: 160, width: 20, height: 60 };

  it('lets a guard through an open doorway and stops one at a shut door', () => {
    const grid = new NavGrid(WORLD, WORLD, DOORWAY_WALLS, OPTIONS);

    expect(grid.findPath(87, 191, 311, 191)).not.toBeNull();

    grid.setDynamicBlockers([SHUT_DOOR]);
    expect(grid.findPath(87, 191, 311, 191)).toBeNull();

    grid.setDynamicBlockers([]);
    expect(grid.findPath(87, 191, 311, 191)).not.toBeNull();
  });

  it('bumps its version only when the shut set actually changes', () => {
    const grid = new NavGrid(WORLD, WORLD, DOORWAY_WALLS, OPTIONS);
    const start = grid.version;

    grid.setDynamicBlockers([SHUT_DOOR]);
    const afterClose = grid.version;
    grid.setDynamicBlockers([SHUT_DOOR]);

    expect(afterClose).toBeGreaterThan(start);
    expect(grid.version).toBe(afterClose);
  });
});
