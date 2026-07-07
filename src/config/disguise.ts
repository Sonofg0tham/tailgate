/**
 * Hi-vis disguise tuning. This is the file Craig edits to change how much a
 * worn disguise dampens guard suspicion and where it stops working. The
 * disguise never fools anyone up close, in a restricted zone (flagged on the
 * zone in Tiled), or once the site alert is raised, and one guard reaching
 * ALERT while it is worn blows it for the rest of the run.
 */
export const DISGUISE = {
  /**
   * Multiplier on the suspicion fill while the disguise holds. 0.15 means a
   * guard clocking a distant hi-vis takes roughly six times longer to care.
   */
  fillMultiplier: 0.15,

  /** Inside this range the disguise does nothing: faces beat vests. */
  closeRangePx: 90,
} as const;
