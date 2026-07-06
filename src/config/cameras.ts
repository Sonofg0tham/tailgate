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
} as const;
