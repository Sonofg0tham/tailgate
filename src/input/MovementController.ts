import Phaser from 'phaser';
import { MOVEMENT } from '../config/movement';
import type { Player } from '../entities/Player';
import { GamepadInput } from './GamepadInput';
import { KeyboardInput, type KeyboardKeys } from './KeyboardInput';
import type { InputDevice, MovementIntent } from './InputState';

/**
 * Merges the two input readers into one result each frame and drives the player.
 * The gamepad is asked first (it is the primary control); if it has nothing to
 * say, the keyboard is asked. Whichever last produced input is the "active
 * device" shown in the debug overlay.
 */
export class MovementController {
  private lastDevice: InputDevice = 'none';

  constructor(private readonly player: Player) {}

  /**
   * Reads both inputs, applies velocity and noise to the player, and returns the
   * resolved intent so the overlay can display it.
   */
  update(
    pad: Phaser.Input.Gamepad.Gamepad | undefined,
    keys: KeyboardKeys | undefined
  ): MovementIntent {
    let intent = GamepadInput.read(pad);
    if (!intent && keys) {
      intent = KeyboardInput.read(keys);
    }

    if (intent) {
      // Remember the active device so an idle frame does not flicker the HUD to "none".
      this.lastDevice = intent.device;
    } else {
      intent = {
        direction: new Phaser.Math.Vector2(0, 0),
        speed: 'idle',
        device: this.lastDevice,
      };
    }

    const speedPx = intent.speed === 'idle' ? 0 : MOVEMENT.speeds[intent.speed];
    this.player.setVelocity(intent.direction.x * speedPx, intent.direction.y * speedPx);
    this.player.noiseRadius = intent.speed === 'idle' ? 0 : MOVEMENT.noiseRadii[intent.speed];

    return intent;
  }
}
