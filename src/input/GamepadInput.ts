import Phaser from 'phaser';
import { MOVEMENT } from '../config/movement';
import type { MovementIntent, SpeedState } from './InputState';

/**
 * Reads the left analogue stick and turns it into a movement intent. This is
 * the primary control: how far the stick is pushed sets the speed, so one input
 * gives both direction and pace. Resting inside the deadzone means stand still.
 */
export const GamepadInput = {
  /**
   * @param pad the active gamepad, or undefined if none is connected.
   * @returns an intent, or null when there is nothing to report (no pad, or the
   *   stick is resting) so the controller can fall back to the keyboard.
   */
  read(pad: Phaser.Input.Gamepad.Gamepad | undefined): MovementIntent | null {
    if (!pad) {
      return null;
    }

    const stick = pad.leftStick;
    const magnitude = stick.length();

    // Inside the deadzone the stick is treated as centred. This also kills the
    // slow drift a worn controller produces when nobody is touching it.
    if (magnitude < MOVEMENT.gamepad.deadzone) {
      return null;
    }

    // Speed comes from how hard the stick is pushed. Read the magnitude BEFORE
    // normalising, otherwise every push would look like a full run.
    let speed: SpeedState;
    if (magnitude <= MOVEMENT.gamepad.creepThreshold) {
      speed = 'creep';
    } else if (magnitude <= MOVEMENT.gamepad.walkThreshold) {
      speed = 'walk';
    } else {
      speed = 'run';
    }

    // Direction is the stick vector normalised to unit length.
    const direction = stick.clone().normalize();

    return { direction, speed, device: 'gamepad' };
  },
};
