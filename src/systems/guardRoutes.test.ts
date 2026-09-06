import { describe, expect, it } from 'vitest';
import buildingCMapRaw from '../../public/maps/building-c.json?raw';
import dataCentreMapRaw from '../../public/maps/data-centre.json?raw';
import warehouseMapRaw from '../../public/maps/warehouse.json?raw';
import buildingCGuardsRaw from '../../public/data/building-c/guards.json?raw';
import dataCentreGuardsRaw from '../../public/data/data-centre/guards.json?raw';
import warehouseGuardsRaw from '../../public/data/warehouse/guards.json?raw';
import { NavGrid, type NavPoint, type NavRect } from './NavGrid';

/**
 * Every authored guard route must be walkable on the nav grid the guards
 * actually use, leg by leg and back round to the start, on the base round
 * and on the wider cautious round. Phase 21 added a second guard per site
 * and this is the guarantee behind it: a node dropped inside a wall, or two
 * nodes with no corridor between them, fails here instead of stranding a
 * guard in play. Craig can edit guards.json and run the tests to know a
 * route is sound before ever launching the game.
 */

interface TiledObject {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: { name: string; objects?: TiledObject[] }[];
}

interface GuardsFile {
  guards: { id: string; route: NavPoint[]; cautiousExtra?: NavPoint[] }[];
}

const LEVELS = [
  ['building-c', buildingCMapRaw, buildingCGuardsRaw],
  ['data-centre', dataCentreMapRaw, dataCentreGuardsRaw],
  ['warehouse', warehouseMapRaw, warehouseGuardsRaw],
] as const;

function gridFor(map: TiledMap): NavGrid {
  const walls: NavRect[] = (map.layers.find((layer) => layer.name === 'walls')?.objects ?? []).map(
    (obj) => ({ x: obj.x ?? 0, y: obj.y ?? 0, width: obj.width ?? 0, height: obj.height ?? 0 })
  );
  return new NavGrid(map.width * map.tilewidth, map.height * map.tileheight, walls);
}

/** Each leg of a closed loop, including the one from the last node home. */
function legs(route: readonly NavPoint[]): [NavPoint, NavPoint][] {
  return route.map((node, i) => [node, route[(i + 1) % route.length]]);
}

describe.each(LEVELS)('%s guard routes', (name, mapRaw, guardsRaw) => {
  const grid = gridFor(JSON.parse(mapRaw) as TiledMap);
  const { guards } = JSON.parse(guardsRaw) as GuardsFile;

  it('lists at least two guards on site', () => {
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(new Set(guards.map((guard) => guard.id)).size).toBe(guards.length);
  });

  for (const guard of guards) {
    const rounds: [string, NavPoint[]][] = [
      ['base', guard.route],
      ['cautious', [...guard.route, ...(guard.cautiousExtra ?? [])]],
    ];

    for (const [label, route] of rounds) {
      it(`${guard.id}: every node on the ${label} round stands on walkable floor`, () => {
        for (const node of route) {
          // A zero-length line is a pure "is this cell open" check.
          expect(grid.hasClearLine(node.x, node.y, node.x, node.y), `${name} ${guard.id} node ${node.x},${node.y}`).toBe(true);
        }
      });

      it(`${guard.id}: every leg of the ${label} round has a path`, () => {
        for (const [from, to] of legs(route)) {
          const path = grid.findPath(from.x, from.y, to.x, to.y, []);
          expect(path, `${name} ${guard.id} ${from.x},${from.y} -> ${to.x},${to.y}`).not.toBeNull();
          expect(path?.length ?? 0).toBeGreaterThan(0);
        }
      });
    }
  }
});
