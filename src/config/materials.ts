/**
 * World materials for the Phase 19 depth pass: what each floor is made of, how
 * a wall reads as having height, and how walls and furniture make contact with
 * the ground. Presentation only, no gameplay maths. This is the file Craig
 * edits to make a surface grainier, a wall taller or a shadow softer.
 *
 * Nothing here is drawn per frame. The floor grain is baked into four small
 * tileable canvas textures at boot from fixed seeds, and the wall shading is a
 * single static Graphics pass, so the cost is paid once per level load.
 *
 * Comfort note (nystagmus, dyspraxia): every default is deliberately quiet.
 * Floor grain sits inside roughly a 4 to 8 percent luminance swing so the amber
 * player, the guard cones and the alert states still pop off the floor, and
 * nothing in this file animates or flashes. Readability beats decoration.
 * Alarm red appears nowhere here: red belongs to detection alone.
 */

/** The four surfaces the three venues are built from. */
export type FloorMaterialKind = 'carpet' | 'hardTile' | 'concrete' | 'raisedFloor';

/** Iteration order for baking. Kept explicit so a new kind must be added here. */
export const FLOOR_MATERIAL_KINDS: readonly FloorMaterialKind[] = [
  'carpet',
  'hardTile',
  'concrete',
  'raisedFloor',
];

/** A grid of joint lines: grout between tiles, or the seams of raised panels. */
export interface FloorSeamSpec {
  /** Distance between joints, px in world space. Must divide the texture size. */
  pitchPx: number;
  /** Thickness of the dark joint itself. 1 keeps it a hairline, never a stripe. */
  widthPx: number;
  /** How dark the joint is. The largest single luminance step in a floor. */
  alpha: number;
  /** Brightness of the 1px lit lip on the far side of the joint, which is what
   *  actually sells the joint as a step between two slabs rather than a line. */
  highlightAlpha: number;
}

/** Soft irregular patches, used for concrete staining. */
export interface FloorBlotchSpec {
  /** Patches per texture. More reads as dirtier concrete, fewer as newer. */
  count: number;
  minRadiusPx: number;
  maxRadiusPx: number;
  /** Peak opacity at a patch centre, fading to nothing at its edge. Half the
   *  patches lighten and half darken, so the average floor brightness holds. */
  alpha: number;
}

export interface FloorMaterialSpec {
  /** Edge length of the generated square texture, px. Also the repeat pitch, so
   *  bigger hides repetition better at the cost of a little more memory. */
  size: number;
  /** Size of one grain fleck, px. 2 reads as a weave or aggregate, 1 as dust.
   *  2 is also steadier under roundPixels when the camera scrolls. */
  grainDotPx: number;
  /** Share of the texture's grain cells that get a fleck, 0 to 1. */
  grainDensity: number;
  /** How far a light fleck lifts the floor. Half of the luminance swing. */
  grainLightAlpha: number;
  /** How far a dark fleck drops the floor. The other half of the swing. */
  grainDarkAlpha: number;
  /** Fixed PRNG seed. Same seed means the identical texture every single boot,
   *  which is why nothing in the world shimmers between runs. */
  seed: number;
  /** Optional joint grid, for slab and panel floors. */
  seam?: FloorSeamSpec;
  /** Optional soft staining, for concrete. */
  blotches?: FloorBlotchSpec;
}

/**
 * The recipes. Alphas are read as "fraction of the way to white or black", so
 * 0.05 is a five percent luminance nudge. Keep the grain pair under about 0.08
 * or characters start competing with the floor for attention.
 */
export const FLOOR_MATERIAL_SPECS: Readonly<Record<FloorMaterialKind, FloorMaterialSpec>> = {
  /** Office carpet: dense, even, no joints. The quietest surface in the game. */
  carpet: {
    size: 64,
    grainDotPx: 2,
    grainDensity: 0.35,
    grainLightAlpha: 0.05,
    grainDarkAlpha: 0.055,
    seed: 0x1a5e01,
  },
  /** Reception and kitchen hard tile: faint grout on a 32px (one map cell) grid. */
  hardTile: {
    size: 64,
    grainDotPx: 1,
    grainDensity: 0.1,
    grainLightAlpha: 0.035,
    grainDarkAlpha: 0.04,
    seed: 0x1a5e02,
    seam: { pitchPx: 32, widthPx: 1, alpha: 0.09, highlightAlpha: 0.05 },
  },
  /** Car park, dock and plant concrete: coarse aggregate plus soft staining. */
  concrete: {
    size: 64,
    grainDotPx: 2,
    grainDensity: 0.22,
    grainLightAlpha: 0.04,
    grainDarkAlpha: 0.05,
    seed: 0x1a5e03,
    blotches: { count: 6, minRadiusPx: 8, maxRadiusPx: 20, alpha: 0.045 },
  },
  /** Server hall raised floor: big 64px panels, so the seams read as a lift. */
  raisedFloor: {
    size: 64,
    grainDotPx: 1,
    grainDensity: 0.08,
    grainLightAlpha: 0.03,
    grainDarkAlpha: 0.035,
    seed: 0x1a5e04,
    seam: { pitchPx: 64, widthPx: 1, alpha: 0.11, highlightAlpha: 0.06 },
  },
};

/**
 * Which material each zone is built from, keyed by the zone's `name` in Tiled.
 * Deliberately separate from FLOOR_TEXTURES in tiles.ts: that map picks the
 * Kenney base tile, this one picks the grain laid over it, and the two do not
 * have to agree. Change a line here and that whole room changes surface with no
 * map edit.
 */
export const FLOOR_MATERIALS: Readonly<Record<string, FloorMaterialKind>> = {
  // Building C
  carPark: 'concrete',
  reception: 'hardTile',
  office: 'carpet',
  kitchen: 'hardTile',
  maintenance: 'concrete',
  loadingDock: 'concrete',
  securityOffice: 'carpet',
  serverRoom: 'raisedFloor',
  // Data centre (carPark shared)
  lobby: 'hardTile',
  noc: 'carpet',
  plantRoom: 'concrete',
  loadingBay: 'concrete',
  corridor: 'hardTile',
  hallA: 'raisedFloor',
  hallB: 'raisedFloor',
  cage: 'raisedFloor',
  // Warehouse (carPark shared)
  whBreak: 'hardTile',
  whLobby: 'hardTile',
  whDock: 'concrete',
  whFloor: 'concrete',
  whOffice: 'carpet',
  whCage: 'raisedFloor',
};

/** Used when a zone has no explicit material, so a typo still renders sanely. */
export const FLOOR_MATERIAL_FALLBACK: FloorMaterialKind = 'hardTile';

/**
 * The material for the map-wide circulation surface, the ground between the
 * named zones. Keyed by venue visual profile id so each site's corridors feel
 * like part of that building.
 */
export const ROUTE_MATERIALS: Readonly<Record<string, FloorMaterialKind>> = {
  'building-c': 'hardTile',
  'data-centre': 'hardTile',
  warehouse: 'concrete',
};

export const ROUTE_MATERIAL_FALLBACK: FloorMaterialKind = 'hardTile';

export const MATERIAL_RENDER = {
  /** One dial for the whole floor grain. 0 turns materials off entirely and
   *  leaves the flat Phase 10 look, 1 is the tuned amount. Drop this first if a
   *  playtester finds the floors busy. */
  strength: 1,
  /** Above a zone's floor tile (depth 0), below its colour wash (depth 1), so
   *  the venue grading still does the room-telling and the grain only adds
   *  material. */
  zoneDepth: 0.5,
  /** Above the map-wide route surface (depth -5), below every zone floor (0). */
  routeDepth: -4.5,
} as const;

/**
 * Fake 3D for wall slabs. Every colour is derived at runtime by lightening or
 * darkening the venue profile's own wall edge colour, so a venue re-tint still
 * carries through and no new hues enter the palette.
 *
 * The mental model is a single light source to the north: the top face of the
 * slab catches it, the north and west lips catch it hardest, and the south face
 * is the side of the wall you would see if the camera tilted, so it goes dark.
 */
export const WALL_EXTRUSION = {
  /** The whole pass draws in one Graphics at this depth: over the wall texture
   *  (10), under props (14) and well under the lighting veil (25). */
  depth: 11,
  /** How far the top face is lifted towards white, 0 to 1. */
  topFaceLighten: 0.35,
  /** Opacity of that lift. Small on purpose: the wall texture must still read. */
  topFaceAlpha: 0.1,
  /** Height of the south-facing side band, px. This IS the apparent wall height,
   *  so it is the number to raise if the building looks flat. Above about 8 the
   *  band starts eating thin walls. */
  southBandPx: 5,
  /** How far the south band is pushed towards black, 0 to 1. */
  southBandDarken: 0.75,
  /** Opacity of the south band, the strongest single value in the pass. It is
   *  contrast against the floor, not against a character, so it stays safe. */
  southBandAlpha: 0.42,
  /** The lit lip along the north edge. 1px is the classic extrusion tell. */
  northHighlightPx: 1,
  northHighlightLighten: 0.7,
  northHighlightAlpha: 0.4,
  /** The same lip down the west edge, weaker because the light is mostly
   *  overhead. Set the px to 0 to drop it and get a purely north-lit look. */
  westHighlightPx: 1,
  westHighlightAlpha: 0.22,
} as const;

/**
 * Ambient occlusion where things meet the ground. Both shadows are generated
 * white gradient textures, tinted at draw time with the venue profile's own
 * shadow colour, so they stay a venue decision rather than a new colour.
 */
export const CONTACT_SHADOW = {
  /** The strip under a wall's south face, where wall meets floor. */
  wall: {
    /** Size of the generated ramp texture. Only the vertical fade matters, the
     *  width is uniform and gets stretched across the wall. */
    textureWidthPx: 8,
    textureHeightPx: 16,
    /** How far the occlusion reaches out onto the floor, px. */
    heightPx: 6,
    /** Peak opacity right at the wall base, fading to nothing at the far edge. */
    alpha: 0.5,
    /** Above the venue's offset drop shadow (9), below the wall surface (10). */
    depth: 9.5,
  },
  /** The soft blob under furniture, the same idea as ART.shadow on characters.
   *  Characters size their ellipse off display width alone because they are all
   *  roughly square. Furniture is not, so this one follows the prop's own
   *  footprint in both axes and rotates with it. */
  prop: {
    textureSizePx: 64,
    /** Blob size relative to the prop's display size. Just under 1 so the soft
     *  edge sits inside the furniture rather than ringing it like an outline. */
    widthFactor: 0.95,
    heightFactor: 0.95,
    /** Downward nudge, relative to the prop's display height. Small on purpose:
     *  this is contact occlusion, the venue's silhouette shadow is what gives
     *  the prop its cast direction. */
    offsetFactor: 0.12,
    /** Floor size so a very small prop still visibly grounds, px. */
    minSizePx: 10,
    /** Peak opacity at the centre. Slightly above the character shadow's 0.25
     *  because this one is a soft gradient rather than a flat ellipse. */
    alpha: 0.3,
    /** Below the prop's own silhouette shadow (14) and the prop itself (15). */
    depth: 13.5,
  },
} as const;
