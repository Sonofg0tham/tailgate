/**
 * Objective and mission tuning for Phase 4. How long the holds take, how close
 * you must stand, and how the report clock reads. Craig tunes the mission feel
 * here without touching scene code.
 */
export const OBJECTIVES = {
  /** How close, in pixels, the player must be to an objective to interact. */
  interactRangePx: 48,

  /** Planting the rogue device on rack 4: hold this long, uninterrupted. */
  plantHoldMs: 3000,

  /** Photographing a secondary objective: hold this long. */
  photoHoldMs: 1000,

  /** How close to the van counts as exfil once the device is planted. */
  exfilRangePx: 90,

  /**
   * The in-fiction clock the Engagement Report uses. The mission "starts" at
   * this time of day and findings are stamped with start + elapsed play time.
   */
  reportClockStart: { hour: 9, minute: 31 },
} as const;
