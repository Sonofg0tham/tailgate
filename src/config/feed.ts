/**
 * Security-feed atmosphere: the quiet suggestion that gameplay is being watched
 * on the building's own cameras, plus the slow breathe on the building's
 * lights. Presentation only, no gameplay maths, so every number here is safe
 * for Craig to retune by feel. The full closed-circuit look (scanlines, roll
 * bar, amber tube cast) stays exclusive to the multiplexer in config/art.ts:
 * this is the whisper of that language, never the shout.
 *
 * Comfort note (non-negotiable): nothing here flashes. Every looping
 * modulation has a period well past 2.5 seconds and an amplitude small enough
 * to read as "the building is alive" rather than as movement. A change of
 * alert level eases over about a second, which is gentler than a cut.
 * Readability beats atmosphere: if a value here makes the floor harder to
 * parse, the value is wrong.
 */
export const FEED = {
  /**
   * Draw order for the whole treatment. Above the lighting veil (25) and every
   * actor, and well below the screen-edge chevrons (998), the HUD text
   * (999-1000) and the DETAINED banner (1999+): the picture gets treated, the
   * readouts never do.
   */
  depth: 900,

  /** The soft corner vignette, like a lens that has seen a few years of service. */
  vignette: {
    /** Peak opacity at the corners while the site is calm. */
    calmAlpha: 0.14,
    /** Peak opacity at cautious. Barely deeper, and warmer (see the tints). */
    cautiousAlpha: 0.16,
    /** Peak opacity at lockdown. The edges close in a little. */
    lockdownAlpha: 0.22,
    /**
     * Vignette colour per alert level. Calm is the near-black base. Cautious is
     * that base nudged towards clearance amber, so the edges warm without ever
     * reading as a light source. Lockdown is the base nudged towards alarm red:
     * red is honest here, the player really is in trouble.
     */
    calmTint: 0x0e1116,
    cautiousTint: 0x3a2a10,
    lockdownTint: 0x40120f,
    /**
     * How long a change of alert level takes to settle, ms. About a second on
     * purpose: slower than a cut, far too slow to register as a flash.
     */
    easeMs: 900,
    /**
     * The lockdown edge pulse: a slow swell on the vignette opacity, plus and
     * minus this much over one period. The period sits above the 2.5s comfort
     * floor and the amplitude is smaller than one level-to-level step, so it
     * reads as breathing rather than as blinking.
     */
    pulseAlpha: 0.02,
    pulsePeriodMs: 3200,
  },

  /** Very faint static: the tell that this picture came down a wire. */
  grain: {
    /** Opacity of the noise sheet. Under the multiplexer's own 0.06 on purpose. */
    alpha: 0.04,
    /**
     * How often the noise pattern jumps, ms. Stepped, never per frame: analogue
     * shimmer without a strobe. Never set this below 120.
     */
    stepMs: 150,
    /** Edge of the generated noise tile, px. */
    tilePx: 64,
  },

  /**
   * A barely-there cool cast over the picture. It costs the greys almost
   * nothing and makes every clearance-amber accent read warmer by contrast,
   * which is the whole trick. Deliberately desaturated: this is a lens, not an
   * accent colour, and the identity palette owns the accents.
   */
  cast: {
    colour: 0x8296ab,
    alpha: 0.035,
  },

  /**
   * The building's lights are on, not painted on. Each static light gets a tiny
   * intensity swell with its own phase, so no two are ever in step. Purely what
   * the human sees: LightModel, and therefore what a guard can spot through
   * darkness, never sees any of this.
   */
  lights: {
    /** Room pools and the loading-dock flood. */
    pool: {
      /** Intensity swing as a fraction: 0.03 is plus and minus 3 per cent. */
      amplitude: 0.03,
      /** One breath takes somewhere in this range, picked per light. */
      minPeriodMs: 3000,
      maxPeriodMs: 6000,
    },
    /** Server rack LEDs: the same tiny swing, a touch quicker, like kit working. */
    rack: {
      amplitude: 0.035,
      minPeriodMs: 2600,
      maxPeriodMs: 4200,
    },
  },
} as const;
