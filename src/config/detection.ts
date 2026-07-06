/**
 * Guard detection tuning. This is the file Craig edits to change how the guard
 * sees and reacts. Patrol routes live separately in public/data/guards.json;
 * this file is the feel of being watched.
 *
 * A "tile" is 32px (the map grid), so ranges are given in tiles and converted.
 */

/** Pixels per map tile. The map is authored on a 32px grid. */
export const TILE_SIZE = 32;

export const DETECTION = {
  /** Vision cone shape. */
  cone: {
    /** How far the guard can see, in tiles. GAME_DESIGN: 7 tiles. */
    rangeTiles: 7,
    /** Total field of view, in degrees. GAME_DESIGN: 70 degrees. */
    fovDegrees: 70,
    /** Rays cast across the fan to draw the cone and clip it at walls. */
    renderRays: 40,
  },

  /**
   * How fast the suspicion meter fills (0 to 100) while the player is inside the
   * cone. Final rate = base * proximityFactor * speedFactor, in points/second.
   * Tuned so a creep at maximum range takes about 3 seconds, and a run at close
   * range is near-instant (GAME_DESIGN).
   */
  suspicion: {
    /**
     * Base fill in points/second before the factors below scale it. Tuned with
     * the factors so a creep at max range (factor ~0.32 x 1.0) fills in ~3s, and
     * a run at close range (factor ~3.0 x 5.0) is near-instant.
     */
    baseFillPerSecond: 100,
    /** Fill multiplier at point-blank range. */
    proximityAtPointBlank: 3.0,
    /** Fill multiplier at maximum range. Low, so far away is slow. */
    proximityAtMaxRange: 0.32,
    /** Fill multiplier by the player's current speed state. */
    speedFactor: {
      idle: 0.7,
      creep: 1.0,
      walk: 2.2,
      run: 5.0,
    },
    /** How fast suspicion drains, points/second, while the player is unseen. */
    decayPerSecond: 22,
    /** At or above this, a PATROL guard becomes CURIOUS and investigates. */
    curiousThreshold: 45,
    /** At 100 the guard goes ALERT. Full is always 100. */
    alertAt: 100,
  },

  /** Guard movement speeds, pixels/second. */
  speed: {
    /** Normal patrol pace. */
    patrol: 70,
    /** Pace when moving to investigate a point of interest. */
    investigate: 110,
    /** Pace when chasing the player. */
    chase: 165,
  },

  /** Behaviour timings, in milliseconds. */
  timing: {
    /** How long the guard looks around at an investigation point. */
    investigatePauseMs: 2000,
    /** How long an ALERT guard keeps chasing after losing sight before giving up. */
    alertGiveUpMs: 4000,
    /** How long the DETAINED flash shows before the run resets. */
    detainedFlashMs: 1200,
  },

  /** How close (pixels, centre to centre) counts as the guard catching the player. */
  detainRadius: 22,
} as const;

/** Cone range in pixels, derived from the tile range. */
export const CONE_RANGE_PX = DETECTION.cone.rangeTiles * TILE_SIZE;
