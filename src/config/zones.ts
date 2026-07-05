/**
 * Per-zone colour washes. Since the visual uplift, floors are real Kenney
 * textures; this colour is painted over each zone's floor at low opacity
 * (see ZONE_TINT_ALPHA) so rooms stay instantly tellable apart without hiding
 * the texture. Never use clearance amber (that is the player) or alarm red
 * (reserved for detection).
 *
 * The key is the zone's `name` in the Tiled map. Change a colour here and that
 * whole room re-washes, no map edit needed.
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

/** How strongly the zone colour wash sits over the floor texture. Keep subtle. */
export const ZONE_TINT_ALPHA = 0.22;

/** The 32px reference grid, available as a debug toggle (off by default). */
export const GRID_TINT = 0x3a3f47;

/** The noise-radius ring. A cool grey, kept distinct from the amber player. */
export const NOISE_RING_TINT = 0x7fd4d4;
