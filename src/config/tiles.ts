/**
 * Art configuration for the visual uplift. All the greybox surfaces are now
 * Kenney CC0 pixel tiles (see CREDITS.md). This file is the single place that
 * maps game concepts (a zone's floor, a prop's name) to a loaded texture, and
 * holds the render scales. Change a mapping here to re-skin without touching
 * scene code.
 */

/** Kenney tiles are 16px. The map is authored on a 32px grid, so render at 2x. */
export const RENDER = {
  /** Native pixel size of a Kenney tile. */
  tileSource: 16,
  /** Scale applied to floor and wall tiling so one tile fills a 32px map cell. */
  tileScale: 2,
  /** Scale applied to furniture prop sprites. */
  propScale: 2,
  /** Scale applied to the player sprite (native ~43px tall becomes ~28px). */
  playerScale: 0.62,
} as const;

/**
 * Every image the game loads, as texture key to public path. Vite serves the
 * public folder at the site root, so paths are relative to that.
 */
export const IMAGE_ASSETS: Record<string, string> = {
  // Floors and walls
  floor_carpet: 'assets/tiles/floor_carpet.png',
  floor_tile: 'assets/tiles/floor_tile.png',
  floor_tile_cool: 'assets/tiles/floor_tile_cool.png',
  floor_concrete: 'assets/tiles/floor_concrete.png',
  wall_brick: 'assets/tiles/wall_brick.png',
  // Furniture props (keys match the names used in the map's props layer)
  prop_desk: 'assets/tiles/prop_desk.png',
  prop_desk_small: 'assets/tiles/prop_desk_small.png',
  prop_cabinet: 'assets/tiles/prop_cabinet.png',
  prop_counter: 'assets/tiles/prop_counter.png',
  prop_counter_alt: 'assets/tiles/prop_counter_alt.png',
  prop_shelf: 'assets/tiles/prop_shelf.png',
  prop_shelf_alt: 'assets/tiles/prop_shelf_alt.png',
  prop_crate: 'assets/tiles/prop_crate.png',
  prop_bin: 'assets/tiles/prop_bin.png',
  prop_server: 'assets/tiles/prop_server.png',
  prop_server_alt: 'assets/tiles/prop_server_alt.png',
  prop_fence: 'assets/tiles/prop_fence.png',
  // Player
  player_hold: 'assets/characters/player_hold.png',
  player_stand: 'assets/characters/player_stand.png',
  // Guard
  guard: 'assets/characters/guard.png',
  // Staff NPCs
  staff_a: 'assets/characters/staff_a.png',
  staff_b: 'assets/characters/staff_b.png',
};

/** Which floor texture each zone uses. Zone tint (zones.ts) is layered on top. */
export const FLOOR_TEXTURES: Record<string, string> = {
  // Building C
  carPark: 'floor_concrete',
  reception: 'floor_carpet',
  office: 'floor_carpet',
  kitchen: 'floor_tile',
  maintenance: 'floor_tile_cool',
  loadingDock: 'floor_concrete',
  securityOffice: 'floor_carpet',
  serverRoom: 'floor_tile_cool',
  // Data centre (carPark shared)
  lobby: 'floor_tile',
  noc: 'floor_carpet',
  plantRoom: 'floor_tile',
  loadingBay: 'floor_concrete',
  corridor: 'floor_tile_cool',
  hallA: 'floor_tile_cool',
  hallB: 'floor_tile_cool',
  cage: 'floor_tile_cool',
};

/** Used if a zone has no explicit floor mapping, so a typo is still walkable. */
export const FLOOR_FALLBACK = 'floor_tile';

/** The wall texture tiled over every wall rectangle. */
export const WALL_TEXTURE = 'wall_brick';
