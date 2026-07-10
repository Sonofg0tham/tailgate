/**
 * World readability tuning, added in Phase 15 after the blind playtest. This
 * is the file Craig edits to change how far away the world can be read from:
 * door lamps, off-screen guard warnings, guard footstep rings, and how long
 * the DETAINED explanation stays up. None of it changes what the AI does,
 * only how legible it is.
 */
export const READABILITY = {
  /** The wall-mounted state lamp above every door. */
  doorLamp: {
    /** Soft glow radius around the lamp, the part visible across the map. */
    glowRadiusPx: 16,
    /** The solid shape at the lamp's centre: circle open, square shut. */
    coreRadiusPx: 5,
    /** Glow strength: the wide outer wash and the tighter inner pool. */
    glowAlphaOuter: 0.16,
    glowAlphaInner: 0.3,
    /** The inner pool's radius as a fraction of the outer glow. */
    innerGlowScale: 0.6,
    /** How far above the doorway the lamp sits. */
    lampRisePx: 10,
    /** How far above the doorway the door's name sits. */
    labelRisePx: 26,
    /** Nearer than this, the door label stays hidden (the door speaks for itself). */
    labelFadeStartPx: 240,
    /** This far away the label is at full strength. */
    labelFadeFullPx: 480,
    /** Full strength for the label, kept below 1 so it sits into the scene. */
    labelMaxAlpha: 0.85,
  },

  /** The DETAINED banner. */
  detain: {
    /**
     * How long the banner (and its cause and resume lines) stays up before
     * the run resets. Phase 15 added the explanation lines; the old 1200ms
     * flash was too short to read them, which defeated the point.
     */
    bannerMs: 2600,
    /** A camera ping this recent gets named as the tip-off on the banner. */
    cameraTipWindowMs: 12000,
  },

  /** Screen-edge chevrons for an agitated guard you cannot see. */
  chevron: {
    /** Guards further away than this stay unannounced, even agitated. */
    rangePx: 700,
    /** How far in from the screen edge the chevron sits. */
    edgeInsetPx: 26,
    /** Chevron size in pixels. */
    sizePx: 11,
  },

  /** Expanding rings where guard footsteps land, the visual ear. */
  noiseRings: {
    /** Footsteps further from the player than this draw nothing. */
    rangePx: 340,
    /** One ring per footfall, roughly walking cadence. */
    stepIntervalMs: 380,
    /** How long one ring lives while it expands and fades. */
    ringLifeMs: 650,
    /** Ring radius at birth and at death. */
    startRadiusPx: 6,
    endRadiusPx: 26,
    /** Line weight and the alpha a newborn ring starts from. A whisper. */
    strokeWidth: 1.5,
    peakAlpha: 0.45,
  },
} as const;
