import Phaser from 'phaser';

/** The three movement speeds, plus idle when the player is standing still. */
export type SpeedState = 'idle' | 'creep' | 'walk' | 'run';

/** Which control the player is currently using. */
export type InputDevice = 'gamepad' | 'keyboard' | 'none';

/**
 * A single frame's worth of movement instruction, produced by either input
 * reader and consumed by the MovementController. Both the gamepad and the
 * keyboard collapse down to this same shape, so the rest of the game never has
 * to care which one the player is holding.
 */
export interface MovementIntent {
  /** Unit direction to travel, or a zero vector when idle. */
  direction: Phaser.Math.Vector2;
  /** How fast, which also decides how much noise the player makes. */
  speed: SpeedState;
  /** Which device produced this intent. */
  device: InputDevice;
}
