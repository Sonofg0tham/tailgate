import { describe, expect, it } from 'vitest';
import { PALETTE_HEX } from './palette';
import { getVenueVisualProfile } from './venueVisualProfiles';

describe('venue visual profile selection', () => {
  it('selects Building C presentation data by level id', () => {
    expect(getVenueVisualProfile('building-c').id).toBe('building-c');
  });

  it('selects the data centre and warehouse profiles by level id', () => {
    expect(getVenueVisualProfile('data-centre').id).toBe('data-centre');
    expect(getVenueVisualProfile('warehouse').id).toBe('warehouse');
  });

  it('selects a distinct wall material for every venue', () => {
    expect(getVenueVisualProfile('building-c').wall.defaultTextureKey).toBe('wall_office');
    expect(getVenueVisualProfile('data-centre').wall.defaultTextureKey).toBe(
      'wall_data_panel'
    );
    expect(getVenueVisualProfile('warehouse').wall.defaultTextureKey).toBe(
      'wall_warehouse_block'
    );
  });

  it('defines a neutral tiled route material for every venue', () => {
    const profiles = ['building-c', 'data-centre', 'warehouse'].map((levelId) =>
      getVenueVisualProfile(levelId)
    );

    for (const profile of profiles) {
      expect(profile.routeSurface).toMatchObject({
        textureKey: expect.stringMatching(/^floor_/),
        textureScale: expect.any(Number),
        edge: {
          colour: expect.any(Number),
          alpha: expect.any(Number),
        },
        threshold: {
          colour: expect.any(Number),
          alpha: expect.any(Number),
        },
      });

      const treatment = profile.routeSurface as typeof profile.routeSurface & {
        textureKey: string;
        textureScale: number;
        edge: { colour: number };
        threshold: { colour: number };
      };
      expect(treatment.textureScale).toBeGreaterThan(0);
      expect([treatment.colour, treatment.edge.colour, treatment.threshold.colour]).not.toContain(
        PALETTE_HEX.amber
      );
      expect([treatment.colour, treatment.edge.colour, treatment.threshold.colour]).not.toContain(
        PALETTE_HEX.alarm
      );
    }

    const materialSignatures = profiles.map((profile) => JSON.stringify(profile.routeSurface));
    expect(new Set(materialSignatures).size).toBe(profiles.length);
  });

  it('uses Building C as the safe fallback for an unknown level', () => {
    expect(getVenueVisualProfile('unknown').id).toBe('building-c');
  });
});
