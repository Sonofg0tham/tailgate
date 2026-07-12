import { describe, expect, it } from 'vitest';
import buildingCRaw from '../../public/maps/building-c.json?raw';
import dataCentreRaw from '../../public/maps/data-centre.json?raw';
import warehouseRaw from '../../public/maps/warehouse.json?raw';

interface TiledObject {
  name?: string;
  type?: string;
  point?: boolean;
  width?: number;
  height?: number;
  y?: number;
  properties?: { name: string; value: unknown }[];
}

interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
}

interface TiledMap {
  layers: TiledLayer[];
}

const MAPS = [
  ['Building C', JSON.parse(buildingCRaw) as TiledMap],
  ['data centre', JSON.parse(dataCentreRaw) as TiledMap],
  ['warehouse', JSON.parse(warehouseRaw) as TiledMap],
] as const;

describe('map-authored venue dressing', () => {
  it.each(MAPS)('%s has a non-empty decals object layer', (_name, map) => {
    const decals = map.layers.find((layer) => layer.name === 'decals');

    expect(decals?.type).toBe('objectgroup');
    expect(decals?.objects?.length).toBeGreaterThan(0);
  });

  it.each(MAPS)('%s keeps props and decals presentation-only', (_name, map) => {
    const dressing = map.layers.filter((layer) =>
      ['props', 'decals'].includes(layer.name)
    );

    for (const layer of dressing) {
      for (const object of layer.objects ?? []) {
        expect(object.type ?? '').toBe('');
        expect(object.point).toBe(true);
        expect(object.width ?? 0).toBe(0);
        expect(object.height ?? 0).toBe(0);
        expect(object.properties?.map((property) => property.name) ?? []).not.toContain(
          'collides'
        );
        expect(object.properties?.map((property) => property.name) ?? []).not.toContain(
          'blocksSight'
        );
      }
    }
  });

  it.each(MAPS)('%s gives the starting car park several route decals', (_name, map) => {
    const decals = map.layers.find((layer) => layer.name === 'decals');
    const exteriorDecals = decals?.objects?.filter((object) => (object.y ?? 0) >= 1280);

    expect(exteriorDecals?.length).toBeGreaterThanOrEqual(3);
  });
});
