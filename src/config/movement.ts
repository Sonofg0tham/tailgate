/**
 * Movement tuning for Tailgate. Everything a designer might want to feel out
 * lives here as plain numbers, so Craig can retune the game without touching
 * scene code. All distances are in pixels, all speeds in pixels per second.
 *
 * The three speed states are shared by both input methods (gamepad and keyboard).
 */
export const MOVEMENT = {
  /** How fast the player travels in each speed state, pixels per second. */
  speeds: {
    /** Creep: slow and silent. */
    creep: 60,
    /** Walk: the default pace, a small noise footprint. */
    walk: 130,
    /** Run: fast and loud. */
    run: 240,
  },

  /**
   * The noise radius drawn around the player in each speed state, in pixels.
   * This is the sound the guards will eventually hear. Creep is 0 on purpose:
   * silent means no ring at all.
   */
  noiseRadii: {
    creep: 0,
    walk: 90,
    run: 180,
  },

  /**
   * Gamepad left-stick tuning. Values are how far the stick is pushed, from
   * 0 (centred) to 1 (pushed fully to the edge).
   */
  gamepad: {
    /**
     * Below this push the stick is treated as resting, so the player stands
     * still. Raise it if a worn controller drifts on its own.
     */
    deadzone: 0.18,
    /** At or below this push the player creeps. */
    creepThreshold: 0.45,
    /** At or below this push the player walks. Anything more is a run. */
    walkThreshold: 0.8,
  },

  /** Camera smoothing. 1 snaps instantly to the player, lower numbers ease. */
  camera: {
    lerp: 0.1,
  },
} as const;
