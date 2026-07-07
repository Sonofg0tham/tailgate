/**
 * Art pass tuning: character animation, drop shadows, ambient particles and
 * the CCTV feed treatment. Presentation only, no gameplay maths. This is the
 * file Craig edits to soften or sharpen the Phase 10 dressing.
 *
 * Comfort note: every motion here is small and slow on purpose (nystagmus).
 * Particle alphas stay under 0.2, the CCTV roll bar crawls, and nothing
 * flashes. Red appears nowhere in this file: red belongs to detection alone.
 */
export const ART = {
  /** The shared walk animation (sway, bob, breathing) on every character. */
  walk: {
    /** Facing wobble while walking, radians. The player's tuned Phase 5 feel. */
    swayRad: 0.1,
    /** Scale bounce while walking (1 +/- this). Reads as footsteps. */
    bobAmount: 0.04,
    /** Steps per second by player pace; guards and staff derive theirs. */
    stepRate: { creep: 8, walk: 13, run: 20 },
    /** Guards and staff: velocity px/s divided by this gives their step rate. */
    pxPerStep: 9,
    /** Step rate clamp for velocity-driven characters. */
    minStepRate: 6,
    maxStepRate: 20,
    /** Idle breathing: tiny scale swell so a still character never looks frozen. */
    breatheAmount: 0.012,
    breatheHz: 0.9,
  },

  /** Code-drawn ellipse drop shadows under every character. */
  shadow: {
    /** Shadow size relative to the sprite's display width. */
    widthFactor: 0.78,
    heightFactor: 0.34,
    /** How far below the sprite centre the shadow sits, relative to width. */
    offsetFactor: 0.30,
    alpha: 0.25,
    /** Above cones (26), below staff (39): grounded under every actor. */
    depth: 38,
  },

  /** Ambient particles. All use the generated soft-dot texture, text-grey. */
  particles: {
    /** Above the grid (20), below the lighting veil (25): darkness dims them. */
    depth: 21,
    tint: 0xc7cdd4,
    /** Dust motes drifting in every pool light. */
    dust: {
      frequencyMs: 700,
      lifespanMs: 6000,
      spreadX: 60,
      spreadY: 40,
      alphaStart: 0.16,
      scaleStart: 0.05,
      scaleEnd: 0.11,
    },
    /** Kettle steam in the kitchen, rising and fattening. */
    steam: {
      frequencyMs: 260,
      lifespanMs: 2600,
      riseMin: 14,
      riseMax: 22,
      alphaStart: 0.18,
      scaleStart: 0.08,
      scaleEnd: 0.26,
    },
    /** Server room haze, slow sideways wisps in the rack heat. */
    haze: {
      frequencyMs: 600,
      lifespanMs: 5200,
      driftPx: 8,
      alphaStart: 0.1,
      scaleStart: 0.18,
      scaleEnd: 0.34,
    },
  },

  /** The multiplexer feed's closed-circuit look. */
  cctv: {
    /** Static grain over the picture. */
    grainAlpha: 0.06,
    /** How often the grain pattern jumps, ms. Deliberately not every frame. */
    grainStepMs: 120,
    /** Horizontal scanlines, one every few pixels. */
    scanlineGapPx: 3,
    scanlineAlpha: 0.12,
    /** The amber monitor cast over the whole picture. */
    amberCastAlpha: 0.05,
    /** Darkened feed edges, like a worn CRT. */
    vignetteAlpha: 0.16,
    vignettePx: 26,
    /** The slow CRT roll bar: height, opacity and one full pass duration. */
    rollBarPx: 16,
    rollBarAlpha: 0.06,
    rollDurationMs: 4200,
  },

  /** The dressed security console. */
  console: {
    /** Blink period for the status pip, ms. Gentle, not strobing. */
    pipBlinkMs: 900,
    screenGlowAlpha: 0.08,
  },

  /** The hi-vis worn look: an amber cast over the player sprite. */
  hivis: {
    tint: 0xffd27a,
  },
} as const;
