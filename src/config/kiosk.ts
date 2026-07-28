/**
 * Meta UI motion tuning: the sign-in kiosk, the contract schedule's stamps, the
 * printed briefing sheet and Engagement Report, and the pause badge's hang on
 * its lanyard. Presentation only, no gameplay maths. This is the file Craig
 * edits to calm, slow or effectively switch off the meta screens' motion.
 *
 * Comfort rules baked into these numbers (nystagmus and dyspraxia):
 * - Nothing flashes. Every fade is eased, and the blinking caret dims rather
 *   than switching off, so there is never a hard on/off edge.
 * - Anything that loops runs a full cycle in 2 seconds or longer, with a tiny
 *   amplitude. The badge sway stays under half a degree.
 * - Every one-shot reveal finishes inside 1.2 seconds AND completes instantly
 *   on any key, pad button or click, so nothing ever has to be sat through.
 * - Menus stay live and navigable the whole time any of this is playing.
 *
 * Red appears nowhere in this file: red belongs to detection alone.
 */
export const KIOSK = {
  /** The block cursor at the end of the selected kiosk row. */
  caret: {
    /**
     * One fade leg, ms. The tween yoyos, so a full dim-and-back cycle is twice
     * this. Matches the security console's status pip (ART.console.pipBlinkMs)
     * so the kiosk and the building read as the same hardware.
     */
    fadeMs: 900,
    /** The caret dims to this, never to nothing: a hard blink would flash. */
    minAlpha: 0.22,
    widthPx: 10,
    heightPx: 20,
    /** Gap between the end of the row's label and the caret, px. */
    gapPx: 8,
  },

  /** The slow amber sheen that passes over the TAILGATE wordmark. */
  sheen: {
    /** A lighter amber, still inside the identity. Never white, never red. */
    colour: '#FFD9A6',
    /** Opacity of the highlight sitting over the letters. Lift, not glare. */
    alpha: 0.35,
    /** One pass across the wordmark, ms. Slow enough to read as a light. */
    sweepMs: 1400,
    /** Start of one pass to the start of the next, ms. Never under 8000. */
    periodMs: 9000,
    /** Delay before the first pass, ms, so the kiosk settles before it shines. */
    firstDelayMs: 1600,
    /** Width of the moving highlight band, px. */
    bandPx: 90,
  },

  /** The one-off "kiosk powering up" type-on for the header line. */
  boot: {
    /** Total time to type the whole header, ms. Fast, and always skippable. */
    totalMs: 600,
  },

  /** The breathing glow ring around the sign-in card. */
  cardGlow: {
    /** One breath in or out, ms. A full cycle is twice this, so over 4s. */
    breathMs: 2400,
    minAlpha: 0.05,
    maxAlpha: 0.16,
    /** How far outside the card the ring sits, px. */
    insetPx: 5,
  },

  /** The one-shot rubber-stamp settle, shared by the schedule and the report. */
  stamp: {
    durationMs: 250,
    /** Scale the stamp lands from, settling to 1. */
    fromScale: 1.15,
    /** Extra tilt it settles out of, radians (about 2.3 degrees). */
    fromRotationRad: 0.04,
    /** Opacity it lands from, so it never pops in from nothing. */
    fromAlpha: 0.4,
    /** Gap between one contract card's stamp landing and the next, ms. */
    staggerMs: 80,
  },

  /** Selection feedback on the contract schedule's cards. */
  cardSelect: {
    /** Peak opacity of the amber ring around the selected card. */
    glowAlpha: 0.28,
    /** How far outside the card the ring sits, px. */
    insetPx: 6,
    /** Cross-fade as the ring moves card to card, ms. Short: never laggy. */
    fadeMs: 180,
    /** One-shot shimmer on a redacted card's bars as it is selected, ms. */
    shimmerMs: 320,
    /** How much the bars brighten at the peak of that shimmer. */
    shimmerAlphaLift: 0.22,
  },

  /** The printed reveal on the briefing sheet and the Engagement Report. */
  print: {
    /** Whole briefing sheet, ms. Comfortably under the 1.2s ceiling. */
    briefingMs: 1000,
    /** Whole report page, ms, before the rating stamp lands on top. */
    reportMs: 1150,
    /** How long a single line takes to come up, ms. */
    lineFadeMs: 110,
  },

  /** The CONFIDENTIAL watermark under the briefing copy. */
  watermark: {
    text: 'CONFIDENTIAL',
    /** Very low on purpose: it must never compete with the copy over it. */
    alpha: 0.05,
    fontSizePx: 96,
    /** Diagonal tilt, radians (about 24 degrees up to the right). */
    rotationRad: -0.42,
  },

  /** The pause badge hanging on its lanyard. */
  badgeSway: {
    /** One swing leg, ms. A full there-and-back is twice this, so over 3s. */
    swingMs: 1900,
    /**
     * Peak tilt either side of straight, radians (about 0.34 degrees). Kept
     * well under half a degree: the badge should read as hanging on a strap,
     * not swinging on one.
     */
    amplitudeRad: 0.006,
  },
} as const;
