import { describe, expect, it } from 'vitest';
import credits from '../../CREDITS.md?raw';
import { PALETTE_HEX } from './palette';
import * as tileConfig from './tiles';
import { IMAGE_ASSETS } from './tiles';

const REQUIRED_ENVIRONMENT_KEYS = [
  'env_chair',
  'env_monitor',
  'env_copier',
  'env_bollard',
  'env_kerb',
  'env_drain',
  'env_barrier',
  'env_vent',
  'env_cable_channel',
  'env_rack_endcap',
  'env_pallet_alt',
  'env_trolley',
  'env_dock_buffer',
  'env_sign_panel',
  'env_fire_exit',
] as const;

describe('environment asset manifest', () => {
  it('contains exactly the fifteen required environment sprite keys', () => {
    const keys = Object.keys(IMAGE_ASSETS)
      .filter((key) => key.startsWith('env_'))
      .sort();

    expect(keys).toEqual([...REQUIRED_ENVIRONMENT_KEYS].sort());
  });

  it('uses a unique repository image for each new environment sprite', () => {
    const paths = Object.entries(IMAGE_ASSETS)
      .filter(([key]) => key.startsWith('env_'))
      .map(([, path]) => path);

    expect(new Set(paths).size).toBe(REQUIRED_ENVIRONMENT_KEYS.length);
  });

  it('loads three distinct venue wall materials', () => {
    const paths = ['wall_office', 'wall_data_panel', 'wall_warehouse_block'].map(
      (key) => IMAGE_ASSETS[key]
    );

    expect(paths.every(Boolean)).toBe(true);
    expect(new Set(paths).size).toBe(3);
  });

  it('subdues the yellow barrier through a neutral render treatment', () => {
    const treatments = (
      tileConfig as typeof tileConfig & {
        DECORATION_TREATMENTS?: Record<
          string,
          { colour: number; alpha: number; tintMode: string }
        >;
      }
    ).DECORATION_TREATMENTS;
    const barrier = treatments?.env_barrier;

    expect(barrier).toMatchObject({ tintMode: 'fill' });
    expect(barrier?.alpha).toBeLessThan(1);
    expect(barrier?.colour).not.toBe(PALETTE_HEX.amber);
    expect(barrier?.colour).not.toBe(PALETTE_HEX.alarm);
  });

  it('credits every new repository image', () => {
    const paths = Object.entries(IMAGE_ASSETS)
      .filter(([key]) => key.startsWith('env_') || key.startsWith('wall_'))
      .map(([, path]) => `public/${path} |`);

    for (const path of paths) {
      expect(credits).toContain(path);
    }
  });
});
