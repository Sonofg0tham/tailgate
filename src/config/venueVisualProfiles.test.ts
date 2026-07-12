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

  it('uses Building C as the safe fallback for an unknown level', () => {
    expect(getVenueVisualProfile('unknown').id).toBe('building-c');
  });
});
