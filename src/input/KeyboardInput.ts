import Phaser from 'phaser';
import type { MovementIntent, SpeedState } from './InputState';

/**
 * The keys the keyboard reader watches. Built once in the scene and handed in
 * each frame. Movement works on both WASD and the arrow keys; Shift creeps and
 * C runs. Ctrl and Alt are deliberately not used (Ctrl+W closes the browser
 * tab, Alt jumps to the browser menu).
 */
export interface KeyboardKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  creep: Phaser.Input.Keyboard.Key;
  run: Phaser.Input.Keyboard.Key;
}

/**
 * Turns the current keyboard state into a movement intent. Default pace is walk;
 * hold Shift to creep, hold C to run.
 */
export const KeyboardInput = {
  read(keys: KeyboardKeys): MovementIntent | null {
    const upHeld = keys.up.isDown || keys.w.isDown;
    const downHeld = keys.down.isDown || keys.s.isDown;
    const leftHeld = keys.left.isDown || keys.a.isDown;
    const rightHeld = keys.right.isDown || keys.d.isDown;

    const x = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
    const y = (downHeld ? 1 : 0) - (upHeld ? 1 : 0);

    if (x === 0 && y === 0) {
      return null;
    }

    // Normalise so diagonals are not roughly 40 percent faster than a straight line.
    const direction = new Phaser.Math.Vector2(x, y).normalize();

    // C (run) wins if both speed keys are held, otherwise Shift creeps.
    let speed: SpeedState = 'walk';
    if (keys.run.isDown) {
      speed = 'run';
    } else if (keys.creep.isDown) {
      speed = 'creep';
    }

    return { direction, speed, device: 'keyboard' };
  },
};
