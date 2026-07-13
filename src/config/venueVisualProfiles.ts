export interface TintTreatment {
  colour: number;
  alpha: number;
}

export interface ShadowTreatment extends TintTreatment {
  offsetX: number;
  offsetY: number;
}

export interface RouteSurfaceTreatment extends TintTreatment {
  textureKey: string;
  textureScale: number;
  edge: TintTreatment;
  threshold: TintTreatment;
}

export interface VenueVisualProfile {
  id: string;
  routeSurface: RouteSurfaceTreatment;
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
  routeSurface: {
    textureKey: 'floor_tile',
    textureScale: 2,
    colour: 0x6f7983,
    alpha: 0.72,
    edge: { colour: 0x87939e, alpha: 0.13 },
    threshold: { colour: 0xb2bac1, alpha: 0.28 },
  },
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
  routeSurface: {
    textureKey: 'floor_tile_cool',
    textureScale: 2,
    colour: 0x53686e,
    alpha: 0.72,
    edge: { colour: 0x71858b, alpha: 0.12 },
    threshold: { colour: 0x98a8ad, alpha: 0.24 },
  },
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
  routeSurface: {
    textureKey: 'floor_concrete',
    textureScale: 2,
    colour: 0x9a9790,
    alpha: 1,
    edge: { colour: 0x8f8b82, alpha: 0.13 },
    threshold: { colour: 0xaaa499, alpha: 0.25 },
  },
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
