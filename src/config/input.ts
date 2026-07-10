/**
 * Input feel tuning. This is the file Craig edits to change how forgiving the
 * game is about presses that mean two things at once.
 */
export const INPUT = {
  /**
   * How long a mode-change press is ignored for, in milliseconds. Covers two
   * beats found in the Phase 14 playtest: the Escape that closes the CCTV
   * console must not also open the pause badge, and the click that refocuses
   * the game window after alt-tab must not throw a bolt. 250ms is longer than
   * any real key release and shorter than any deliberate second press.
   */
  swallowWindowMs: 250,
} as const;
