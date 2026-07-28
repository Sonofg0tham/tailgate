/**
 * CCTV camera and breaker tuning. This is the file Craig edits to change how
 * cameras notice the player and how the breaker knocks them offline. Camera
 * placement and circuit wiring live separately in public/data/cameras.json;
 * this file is the feel of being watched by a fixed lens instead of a guard.
 */
export const CAMERAS = {
  /** How long the player must sit in a cone before it pings, then alarms. */
  dwell: {
    /** GAME_DESIGN: a 0.8s curious ping. */
    curiousAfterMs: 800,
    /** GAME_DESIGN: 2s continuous dwell raises the alert. */
    alertAfterMs: 2000,
  },

  /**
   * After a camera raises an alert, how long before it can raise another. The
   * player must also leave the cone's arc before the camera re-arms, so a
   * single long low-framerate frame or standing still cannot fire twice.
   */
  reArmMs: 4000,

  /** The breaker panel: kills wired cameras for a while, then cools down. */
  breaker: {
    /** How long tripped cameras stay dark. */
    killDurationMs: 20000,
    /** How long the breaker refuses to trip again after cameras come back. */
    cooldownMs: 60000,
    /** How close the player must be to the breaker to interact with it. */
    interactRangePx: 60,
  },

  /** Colour of the small "light's off" pip drawn at a dead camera's housing. */
  offlinePipColour: 0x555a63,

  /**
   * The camera prop's art and its state badges. The two PNGs are built by
   * tools/blender/build_camera_sprite.py, which models a bracket, a tapered
   * housing and a drooping lens barrel and renders them straight down. Re-run
   * that script to change the art; nothing here paints the camera itself.
   *
   * Both sprites are 32x32 and are drawn at native size. The game runs with
   * pixelArt and roundPixels on, so drawing 1:1 is what keeps them crisp.
   */
  art: {
    /** The neutral grey housing. Never tinted: it is world dressing. */
    housingKey: 'cctv_camera',
    housingPath: 'assets/environment/cctv_camera.png',
    /** The white lens disc, tinted per state. Same frame, so it stays aligned. */
    lensKey: 'cctv_camera_lens',
    lensPath: 'assets/environment/cctv_camera_lens.png',
    /** 1 means native size. Anything else resamples and softens the sprite. */
    scale: 1,
    /** Housing alpha when the circuit is dead, so a dark camera looks dark. */
    offlineHousingAlpha: 0.45,
    /** Lens brightness per state family. Offline is nearly out, looped is dim. */
    lensAlpha: { live: 1, looped: 0.8, offline: 0.3 },
    /** Radius of the ring and corner badges drawn around the housing, px. */
    badgeRadiusPx: 12,
    /** Line width of every badge stroke, px. */
    badgeLineWidthPx: 1.5,
    /**
     * One full turn of the looped-feed marker, ms. Deliberately slow and
     * rotation only, no flashing and no size change (see Accessibility in
     * GAME_DESIGN.md). Raise it to calm the motion further.
     */
    loopSpinMs: 4000,
    /** How many dashes make up that turning ring. */
    loopDashCount: 6,
  },
} as const;
