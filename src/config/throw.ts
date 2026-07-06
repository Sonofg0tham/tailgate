/**
 * Distraction-throw tuning. The player carries a few bolts and lobs one to make
 * a noise the guard investigates, pulling it off patrol. Aim is by mouse
 * (keyboard) or the right stick (gamepad); see the scene for the bindings.
 */
export const THROW = {
  /** Bolts available per run. Refills to this on every restart. */
  boltCount: 3,

  /** How far a bolt can be thrown, in pixels. Aim beyond this is clamped. */
  maxRangePx: 340,

  /** How fast the thrown bolt travels to its landing spot, pixels per second. */
  boltSpeedPxPerSec: 720,

  /**
   * How far the landing noise carries to guards, in pixels. A guard within this
   * radius of the landing spot is pulled to investigate it.
   */
  noiseRadiusPx: 230,

  /** Gamepad right-stick push below this is ignored when aiming. */
  aimDeadzone: 0.25,
} as const;
