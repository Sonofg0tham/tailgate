import Phaser from 'phaser';
import { PALETTE_HEX } from '../config/palette';

/** The side length of the greybox player square, in pixels. */
const PLAYER_SIZE = 24;

/**
 * The player: an amber greybox square with a dynamic Arcade body. It also
 * carries the current noise radius, which the overlay draws and the guards will
 * later hear. Real art replaces the square in a later phase.
 */
export class Player {
  readonly sprite: Phaser.GameObjects.Rectangle;

  /** How far the player's noise currently carries, in pixels. 0 means silent. */
  noiseRadius = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, PALETTE_HEX.amber);
    this.sprite.setDepth(40);

    scene.physics.add.existing(this.sprite);
    this.body.setCollideWorldBounds(true);
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  setVelocity(x: number, y: number): void {
    this.body.setVelocity(x, y);
  }
}
