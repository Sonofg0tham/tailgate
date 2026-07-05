/**
 * Greybox colours for the building. These are throwaway debug tints, NOT the
 * final art palette. The only rule: keep every zone clearly distinct and high
 * contrast so rooms read at a glance, and never use clearance amber (that is the
 * player) or alarm red (reserved for detection).
 *
 * The key is the zone's `name` in the Tiled map. Change a colour here and that
 * whole room recolours, no map edit needed.
 */
export const ZONE_TINTS: Record<string, number> = {
  carPark: 0x2b3a4a, // slate blue-grey
  reception: 0x3d5a45, // muted green
  office: 0x4a4a5e, // dusky indigo
  kitchen: 0x6b5335, // warm brown
  maintenance: 0x555a2e, // olive
  loadingDock: 0x5a3d4a, // dusty plum
  securityOffice: 0x2e5a5a, // teal
  serverRoom: 0x1f3a5c, // deep blue
};

/** Shown if the map names a zone with no tint above, so mistakes are obvious. */
export const FALLBACK_TINT = 0xff00ff; // magenta, deliberately jarring

/** Walls: a light neutral, deliberately lighter than every floor tint. */
export const WALL_TINT = 0x9aa0a8;

/** The 32px reference grid drawn over the floor for readability. */
export const GRID_TINT = 0x3a3f47;

/** The noise-radius ring. A cool grey, kept distinct from the amber player. */
export const NOISE_RING_TINT = 0x7fd4d4;
