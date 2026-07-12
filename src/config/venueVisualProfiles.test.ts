import { describe, expect, it } from 'vitest';
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

  it('uses Building C as the safe fallback for an unknown level', () => {
    expect(getVenueVisualProfile('unknown').id).toBe('building-c');
  });
});
