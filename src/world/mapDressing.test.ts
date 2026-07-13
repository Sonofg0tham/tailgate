import { describe, expect, it } from 'vitest';
import buildingCRaw from '../../public/maps/building-c.json?raw';
import dataCentreRaw from '../../public/maps/data-centre.json?raw';
import warehouseRaw from '../../public/maps/warehouse.json?raw';

interface TiledObject {
  name?: string;
  type?: string;
  point?: boolean;
  x?: number;
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

  it('gives the Building C reception corridor one deliberate passage', () => {
    const buildingC = MAPS[0][1];
    const walls = buildingC.layers.find((layer) => layer.name === 'walls');
    const northBoundary = walls?.objects
      ?.filter((object) => object.y === 976 && object.height === 24)
      .map(({ x, width }) => ({ x, width }));

    expect(northBoundary).toEqual([
      { x: 976, width: 144 },
      { x: 1380, width: 204 },
    ]);
  });

  it('gives each Building C restricted room one doorway onto its corridor', () => {
    const buildingC = MAPS[0][1];
    const walls = buildingC.layers.find((layer) => layer.name === 'walls');
    const southBoundaries = walls?.objects
      ?.filter((object) => object.y === 768 && object.height === 24)
      .map(({ x, width }) => ({ x, width }));

    expect(southBoundaries).toEqual([
      { x: 1712, width: 128 },
      { x: 1940, width: 108 },
      { x: 2080, width: 50 },
      { x: 2230, width: 106 },
    ]);
  });

  it('seals Building C room floors from circulation except at deliberate thresholds', () => {
    const buildingC = MAPS[0][1];
    const walls = buildingC.layers.find((layer) => layer.name === 'walls');
    const boundaryNames = [
      'northWingBoundary',
      'kitchenWest',
      'kitchenSouth',
      'maintenanceNorth',
      'maintenanceWest',
      'maintenanceEastUpper',
      'maintenanceEastLower',
      'loadingDockLeft',
    ];
    const boundaries = walls?.objects
      ?.filter((object) => boundaryNames.includes(object.name ?? ''))
      .map(({ name, x, y, width, height }) => ({ name, x, y, width, height }));

    expect(boundaries).toEqual([
      { name: 'northWingBoundary', x: 296, y: 496, width: 1344, height: 24 },
      { name: 'kitchenWest', x: 296, y: 520, width: 24, height: 288 },
      { name: 'kitchenSouth', x: 296, y: 808, width: 464, height: 24 },
      { name: 'maintenanceNorth', x: 96, y: 880, width: 408, height: 24 },
      { name: 'maintenanceWest', x: 96, y: 904, width: 24, height: 320 },
      { name: 'maintenanceEastUpper', x: 480, y: 904, width: 24, height: 88 },
      { name: 'maintenanceEastLower', x: 480, y: 1088, width: 24, height: 136 },
      { name: 'loadingDockLeft', x: 1688, y: 904, width: 24, height: 320 },
    ]);
  });

  it('closes Building C separator and outer-edge slips while retaining its doorways', () => {
    const buildingC = MAPS[0][1];
    const walls = buildingC.layers.find((layer) => layer.name === 'walls');
    const named = (name: string): TiledObject | undefined =>
      walls?.objects?.find((object) => object.name === name);
    const rect = (name: string): Pick<TiledObject, 'x' | 'y' | 'width' | 'height'> | undefined => {
      const object = named(name);
      return object
        ? { x: object.x, y: object.y, width: object.width, height: object.height }
        : undefined;
    };

    expect(rect('extBottomA')).toEqual({ x: 0, y: 1224, width: 300, height: 24 });
    expect(rect('extBottomD')).toEqual({ x: 2100, y: 1224, width: 300, height: 24 });
    expect(rect('leftColumnWallUpper')).toEqual({ x: 680, y: 520, width: 80, height: 72 });
    expect(rect('leftColumnWallUpperLower')).toEqual({ x: 680, y: 688, width: 80, height: 216 });
    expect(rect('officeRightUpper')).toEqual({ x: 1640, y: 384, width: 72, height: 236 });
    expect(rect('officeRightLower')).toEqual({ x: 1640, y: 720, width: 72, height: 184 });
  });

  it('labels the Building C route and objective with presentation-only signs', () => {
    const buildingC = MAPS[0][1];
    const presentationObjects = buildingC.layers
      .filter((layer) => ['props', 'decals'].includes(layer.name))
      .flatMap((layer) => layer.objects ?? []);
    const labels = presentationObjects
      ?.flatMap((object) => object.properties ?? [])
      .filter((property) => property.name === 'label')
      .map((property) => property.value);

    expect(labels).toEqual(expect.arrayContaining(['RECEPTION', 'SECURITY', 'SERVER ROOM', 'RACK 4']));
  });
});
