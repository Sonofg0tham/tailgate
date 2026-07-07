import Phaser from 'phaser';
import { ART } from '../config/art';
import { RENDER } from '../config/tiles';
import type { MovementIntent } from '../input/InputState';
import { CharacterAnimator } from '../systems/CharacterAnimator';

/** Texture key for the player, a Kenney top-down operator holding the device. */
const PLAYER_TEXTURE = 'player_hold';

/**
 * The player: a top-down Kenney sprite that rotates to face the way it is moving.
 * The walking sway, bob, idle breathing and drop shadow all come from the
 * shared CharacterAnimator. The sprite art faces east by default, which matches
 * Phaser's zero angle, so facing needs no offset. Collision uses a circle body,
 * which is unaffected by the sprite's rotation, so bumping walls stays stable
 * whichever way the player faces.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  /** How far the player's noise currently carries, in pixels. 0 means silent. */
  noiseRadius = 0;

  private readonly animator: CharacterAnimator;
  private face = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, PLAYER_TEXTURE);
    this.sprite.setScale(RENDER.playerScale);
    this.sprite.setDepth(40);
    this.sprite.setCollideWorldBounds(true);

    // Centre a circular collision body inside the sprite frame.
    const frameW = this.sprite.width;
    const frameH = this.sprite.height;
    const radius = Math.min(frameW, frameH) * 0.34;
    this.sprite.setCircle(radius, frameW / 2 - radius, frameH / 2 - radius);

    this.animator = new CharacterAnimator(scene, this.sprite, RENDER.playerScale);
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
    this.sprite.setVelocity(x, y);
  }

  /**
   * Faces the movement direction and hands the walk (sway, bob, breathing and
   * the drop shadow) to the shared animator. When idle the last facing holds.
   */
  applyMotion(intent: MovementIntent, deltaMs: number): void {
    const moving =
      intent.speed !== 'idle' && (intent.direction.x !== 0 || intent.direction.y !== 0);

    if (moving) {
      this.face = Math.atan2(intent.direction.y, intent.direction.x);
    }
    const stepRate = intent.speed === 'idle' ? 0 : ART.walk.stepRate[intent.speed];
    this.animator.update(deltaMs, moving, stepRate, this.face);
  }
}
