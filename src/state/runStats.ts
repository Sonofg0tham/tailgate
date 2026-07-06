/**
 * Run statistics, kept in memory across scene restarts. Nothing displays these
 * yet beyond the debug overlay; Phase 4's Engagement Report will read them to
 * describe what actually happened in the run.
 *
 * A module-level singleton on purpose: it must survive scene.restart() (which a
 * detain triggers), so it cannot live on the scene.
 */
export interface RunStats {
  /** Times the guard fully spotted the player (entered ALERT). */
  timesSpotted: number;
  /** Times the guard caught the player. */
  detains: number;
}

const stats: RunStats = {
  timesSpotted: 0,
  detains: 0,
};

export function getRunStats(): Readonly<RunStats> {
  return stats;
}

export function recordSpotted(): void {
  stats.timesSpotted += 1;
}

export function recordDetain(): void {
  stats.detains += 1;
}

/** Clears the stats. Not called on detain (a detain keeps counting), only for a fresh run. */
export function resetRunStats(): void {
  stats.timesSpotted = 0;
  stats.detains = 0;
}
