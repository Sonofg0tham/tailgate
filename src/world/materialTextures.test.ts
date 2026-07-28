import { describe, expect, it } from 'vitest';
import buildingCRaw from '../../public/maps/building-c.json?raw';
import dataCentreRaw from '../../public/maps/data-centre.json?raw';
import warehouseRaw from '../../public/maps/warehouse.json?raw';
import {
  FLOOR_MATERIALS,
  FLOOR_MATERIAL_KINDS,
  FLOOR_MATERIAL_SPECS,
} from '../config/materials';
import { PALETTE_HEX } from '../config/palette';
import {
  createSeededRandom,
  darkenColour,
  floorMaterialKey,
  lightenColour,
  routeMaterialKind,
  zoneMaterialKind,
} from './materialTextures';

interface TiledMap {
  layers: { name: string; objects?: { name?: string }[] }[];
}

const MAP_ZONE_NAMES = [buildingCRaw, dataCentreRaw, warehouseRaw]
  .flatMap((raw) => {
    const map = JSON.parse(raw) as TiledMap;
    return map.layers.find((layer) => layer.name === 'zones')?.objects ?? [];
  })
  .map((zone) => zone.name ?? '');

describe('floor material selection', () => {
  it('gives every authored zone in every venue an explicit material', () => {
    for (const name of MAP_ZONE_NAMES) {
      expect(FLOOR_MATERIALS[name], `zone "${name}" has no material`).toBeDefined();
    }
  });

  it('falls back safely for an unknown zone or venue', () => {
    expect(FLOOR_MATERIAL_KINDS).toContain(zoneMaterialKind('nonsense'));
    expect(FLOOR_MATERIAL_KINDS).toContain(routeMaterialKind('nonsense'));
  });

  it('namespaces generated texture keys away from the loaded tiles', () => {
    const keys = FLOOR_MATERIAL_KINDS.map(floorMaterialKey);

    expect(new Set(keys).size).toBe(FLOOR_MATERIAL_KINDS.length);
    for (const key of keys) {
      expect(key.startsWith('mat_floor_')).toBe(true);
    }
  });
});

describe('floor material specs', () => {
  it('keeps the grain inside the readable luminance band', () => {
    // Accessibility guard, not a style preference: above roughly 8 percent the
    // floor starts competing with characters and cones for attention.
    for (const kind of FLOOR_MATERIAL_KINDS) {
      const spec = FLOOR_MATERIAL_SPECS[kind];
      expect(spec.grainLightAlpha).toBeGreaterThan(0);
      expect(spec.grainLightAlpha).toBeLessThanOrEqual(0.08);
      expect(spec.grainDarkAlpha).toBeGreaterThan(0);
      expect(spec.grainDarkAlpha).toBeLessThanOrEqual(0.08);
      expect(spec.grainDensity).toBeGreaterThan(0);
      expect(spec.grainDensity).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every seam grid tileable within its texture', () => {
    for (const kind of FLOOR_MATERIAL_KINDS) {
      const spec = FLOOR_MATERIAL_SPECS[kind];
      if (!spec.seam) {
        continue;
      }
      expect(spec.size % spec.seam.pitchPx).toBe(0);
      expect(spec.seam.widthPx).toBeLessThan(spec.seam.pitchPx);
    }
  });

  it('gives each material its own seed so no two surfaces repeat', () => {
    const seeds = FLOOR_MATERIAL_KINDS.map((kind) => FLOOR_MATERIAL_SPECS[kind].seed);

    expect(new Set(seeds).size).toBe(FLOOR_MATERIAL_KINDS.length);
  });
});

describe('seeded randomness', () => {
  it('produces the identical sequence for the same seed', () => {
    const a = createSeededRandom(0x1a5e01);
    const b = createSeededRandom(0x1a5e01);
    const first = Array.from({ length: 16 }, () => a());
    const second = Array.from({ length: 16 }, () => b());

    expect(first).toEqual(second);
  });

  it('produces a different sequence for a different seed', () => {
    const a = Array.from({ length: 16 }, createSeededRandom(1));
    const b = Array.from({ length: 16 }, createSeededRandom(2));

    expect(a).not.toEqual(b);
  });

  it('stays inside the unit interval', () => {
    const random = createSeededRandom(0xdecaf);
    for (let i = 0; i < 512; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('wall shade derivation', () => {
  it('lightens and darkens without leaving the source hue behind', () => {
    const source = 0x98a2ac; // Building C's wall edge colour.

    expect(lightenColour(source, 0)).toBe(source);
    expect(darkenColour(source, 0)).toBe(source);
    expect(lightenColour(source, 1)).toBe(0xffffff);
    expect(darkenColour(source, 1)).toBe(0x000000);
  });

  it('never invents alarm red or clearance amber from a neutral wall', () => {
    for (const source of [0x98a2ac, 0x89989f, 0xa09f96]) {
      for (const amount of [0.2, 0.35, 0.7, 0.75]) {
        expect(lightenColour(source, amount)).not.toBe(PALETTE_HEX.alarm);
        expect(lightenColour(source, amount)).not.toBe(PALETTE_HEX.amber);
        expect(darkenColour(source, amount)).not.toBe(PALETTE_HEX.alarm);
        expect(darkenColour(source, amount)).not.toBe(PALETTE_HEX.amber);
      }
    }
  });
});
