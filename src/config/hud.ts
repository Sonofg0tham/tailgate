/**
 * In-game HUD tuning and copy (Phase 21). The Phase 14 field-readout chip
 * grew into a proper mission readout: site state, pace and noise, how lit
 * the player is, bolts, the current objective and the evidence count. This
 * is the file Craig edits to reword or resize any of it. Layout numbers are
 * in unscaled 960x540 pixels; the HUD text setting scales the lot.
 *
 * Red appears nowhere in this file: red belongs to detection alone. The
 * LOCKDOWN trim is the one exception and it is a detection state.
 */
export const HUD = {
  /** The chips: dark sheet, thin amber trim, mono text. */
  chip: {
    marginPx: 8,
    padX: 12,
    padY: 9,
    rowPx: 16,
    fontPx: 12,
    /** Left chip width; the right chip sizes itself to its longest line. */
    leftWidthPx: 214,
    fillAlpha: 0.88,
  },

  /** The small bars beside PACE and EXPOSURE. */
  bar: {
    widthPx: 56,
    heightPx: 6,
    trackAlpha: 0.25,
  },

  /** Bolt pips: a filled diamond per bolt left, hollow once thrown. */
  pips: {
    sizePx: 5,
    gapPx: 14,
  },

  /** How lit the player is, as a word (never colour alone) and a bar. */
  exposure: {
    dimAbove: 0.34,
    litAbove: 0.67,
    words: { hidden: 'HIDDEN', dim: 'DIM', lit: 'LIT' },
  },

  /** The pace words. STILL rather than IDLE: the player is a person, not a process. */
  pace: { idle: 'STILL', creep: 'CREEP', walk: 'WALK', run: 'RUN' },

  /** Objective copy. The target line under it comes from the level's venue data. */
  objective: {
    plant: 'PLANT THE DEVICE',
    exfil: 'RETURN TO THE VAN',
    exfilDetail: 'DEVICE PLANTED. GET OFF SITE.',
    evidence: 'EVIDENCE',
  },

  /** The border diamond pointing at an off-screen objective. */
  edgeMarker: {
    sizePx: 9,
  },

  /**
   * How far in from each screen edge the border markers (objective diamond,
   * guard chevrons) stop. Deeper at the top so they never hide behind the
   * chips, and at the bottom so they stay clear of the prompt line.
   */
  edgeInsets: { left: 32, right: 32, top: 90, bottom: 64 },

  /** The player's own noise: a faint steady ring plus a ripple per footstep. */
  playerNoise: {
    ringAlpha: 0.3,
    rippleLifeMs: 720,
    rippleStartPx: 8,
  },
} as const;
