/**
 * Door and schedule tuning for Phase 3. This is where Craig tunes how forgiving
 * the ways in are. The door geometry (where each door sits) lives in the Tiled
 * map's `doors` object layer; the behaviour and timings live here.
 *
 * Three door types:
 *  - badge:   locked. Opens when authorised staff badge through it, then stays
 *             open for `tailgateWindowMs` so you can slip in behind them.
 *  - smokers: propped open by staff on a repeating break window, otherwise shut.
 *  - shutter: the loading-dock roller shutter, open on a repeating delivery
 *             window (the driver wheeling deliveries in and out), otherwise shut.
 *
 * Phase 14 playtest note: the openForMs windows below were lengthened by about
 * half after a blind playtest. Crossing the car park to a door took longer than
 * the window it was walking towards, which read as unfair rather than tense.
 */
export const DOORS = {
  /**
   * How long a badge door stays open after the staff member passes. The
   * tailgate window. 1.6s demanded you already be moving when the badge
   * beeped; 2.0s rewards watching and reacting instead.
   */
  tailgateWindowMs: 2000,

  /**
   * The smokers' door break window, a repeating open/closed cycle in
   * milliseconds. The door starts closed; `phaseMs` shifts when in the cycle the
   * first opening lands (9000 here means the first break window opens ~5s in).
   */
  smokers: {
    openForMs: 13000,
    closedForMs: 14000,
    phaseMs: 9000,
  },

  /** The loading-dock shutter delivery window, a repeating open/closed cycle. */
  shutter: {
    openForMs: 10000,
    closedForMs: 15000,
    phaseMs: 3000,
  },
} as const;
