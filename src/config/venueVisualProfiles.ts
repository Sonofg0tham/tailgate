export interface TintTreatment {
  colour: number;
  alpha: number;
}

export interface ShadowTreatment extends TintTreatment {
  offsetX: number;
  offsetY: number;
}

export interface VenueVisualProfile {
  id: string;
  routeSurface: TintTreatment;
  wall: {
    defaultTextureKey: string;
    textureScale: number;
    materialsByZone: Readonly<Record<string, string>>;
    shadow: ShadowTreatment;
    edge: TintTreatment;
  };
  propShadow: ShadowTreatment;
  lightPools: Readonly<Record<string, TintTreatment>>;
}

const BUILDING_C: VenueVisualProfile = {
  id: 'building-c',
  routeSurface: { colour: 0x1a2027, alpha: 1 },
  wall: {
    defaultTextureKey: 'wall_office',
    textureScale: 0.5,
    materialsByZone: {},
    shadow: { colour: 0x050709, alpha: 0.22, offsetX: 5, offsetY: 6 },
    edge: { colour: 0x98a2ac, alpha: 0.16 },
  },
  propShadow: { colour: 0x050709, alpha: 0.2, offsetX: 4, offsetY: 5 },
  lightPools: {
    pool: { colour: 0x9caaa9, alpha: 0.06 },
    flood: { colour: 0xb3bab7, alpha: 0.055 },
    rack: { colour: 0x78979a, alpha: 0.075 },
  },
};

const DATA_CENTRE: VenueVisualProfile = {
  id: 'data-centre',
  routeSurface: { colour: 0x151c22, alpha: 1 },
  wall: {
    defaultTextureKey: 'wall_data_panel',
    textureScale: 0.5,
    materialsByZone: {},
    shadow: { colour: 0x040608, alpha: 0.25, offsetX: 5, offsetY: 7 },
    edge: { colour: 0x89989f, alpha: 0.14 },
  },
  propShadow: { colour: 0x040608, alpha: 0.23, offsetX: 4, offsetY: 6 },
  lightPools: {
    pool: { colour: 0x839b9c, alpha: 0.055 },
    flood: { colour: 0xa6b2b0, alpha: 0.05 },
    rack: { colour: 0x6f9699, alpha: 0.09 },
  },
};

const WAREHOUSE: VenueVisualProfile = {
  id: 'warehouse',
  routeSurface: { colour: 0x202328, alpha: 1 },
  wall: {
    defaultTextureKey: 'wall_warehouse_block',
    textureScale: 0.5,
    materialsByZone: {},
    shadow: { colour: 0x070809, alpha: 0.2, offsetX: 6, offsetY: 6 },
    edge: { colour: 0xa09f96, alpha: 0.15 },
  },
  propShadow: { colour: 0x070809, alpha: 0.2, offsetX: 5, offsetY: 5 },
  lightPools: {
    pool: { colour: 0x98988b, alpha: 0.055 },
    flood: { colour: 0xb1b0a4, alpha: 0.06 },
    rack: { colour: 0x7d9291, alpha: 0.07 },
  },
};

const VENUE_VISUAL_PROFILES: Readonly<Record<string, VenueVisualProfile>> = {
  'building-c': BUILDING_C,
  'data-centre': DATA_CENTRE,
  warehouse: WAREHOUSE,
};

/** Returns the venue's presentation profile, with Building C as the safe fallback. */
export function getVenueVisualProfile(levelId: string): VenueVisualProfile {
  return VENUE_VISUAL_PROFILES[levelId] ?? BUILDING_C;
}
