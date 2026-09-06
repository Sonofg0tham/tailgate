/**
 * Guard awareness presentation tuning (Phase 21). Everything the player sees
 * about what a guard is thinking, drawn over the guard's head: the suspicion
 * arc, the "?" and "!" glyphs, the spoken bark lines, the last-known-position
 * marker while a guard searches, and the radio countdown ring while an alert
 * guard has you in sight. Presentation only, no gameplay maths. This is the
 * file Craig edits to make guards louder or quieter about their state.
 *
 * Comfort rules (nystagmus and dyspraxia): the glyphs pop once and then hold
 * still, nothing loops faster than two seconds, nothing strobes, and every
 * signal pairs a shape with its colour. Red appears only on the "!" and the
 * radio ring, both of which mean the player is in trouble.
 */
export const AWARENESS = {
  /** The thin arc over a guard's head that fills as suspicion rises. */
  arc: {
    /** How far above the sprite centre the arc sits, px. */
    risePx: 24,
    radiusPx: 11,
    thicknessPx: 3,
    /** Suspicion below this draws nothing, so a calm guard stays clean. */
    showAbovePct: 4,
    /** Track and fill opacity. */
    trackAlpha: 0.28,
    fillAlpha: 0.95,
  },

  /** The "?" (curious) and "!" (alert) glyphs. */
  glyph: {
    /** How far above the sprite centre the glyph sits, px. */
    risePx: 40,
    fontSizePx: 22,
    /** The one-shot pop: scale it lands from and how long the settle takes. */
    popFromScale: 1.6,
    popMs: 160,
    /** Glyph outline so it reads over any floor. */
    strokePx: 3,
  },

  /** Short spoken lines above a guard at each state change. */
  bark: {
    /** How far above the glyph the bark sits, px. */
    risePx: 62,
    fontSizePx: 12,
    /** Visible time, then the fade. */
    holdMs: 1800,
    fadeMs: 400,
    /** How far the line drifts upward as it fades, px. Small and slow. */
    driftPx: 8,
    /** Minimum gap between two barks from the same guard, ms. */
    cooldownMs: 2600,
    /** Barks further from the player than this are not shown. */
    rangePx: 620,
  },

  /** The marker at the spot a searching guard is heading for. */
  lastSeen: {
    radiusPx: 14,
    thicknessPx: 2,
    alpha: 0.75,
    /** Dash count around the ring and how long one slow turn takes, ms. */
    dashCount: 8,
    spinMs: 3000,
    /** Marker suppressed when the guard is this close to the spot, px. */
    hideWithinPx: 30,
  },

  /** The radio countdown while an ALERT guard can see the player. */
  radio: {
    /** Ring radius around the "!" glyph, px, and its stroke. */
    radiusPx: 16,
    thicknessPx: 3,
    trackAlpha: 0.3,
    fillAlpha: 0.95,
  },
} as const;
