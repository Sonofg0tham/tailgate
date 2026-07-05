import Phaser from 'phaser';
import { RENDER } from '../config/tiles';
import type { MovementIntent } from '../input/InputState';

/** Texture key for the player, a Kenney top-down operator holding the device. */
const PLAYER_TEXTURE = 'player_hold';

/**
 * The player: a top-down Kenney sprite that rotates to face the way it is moving
 * and adds a subtle walking sway and bob while in motion. The sprite art faces
 * east by default, which matches Phaser's zero angle, so facing needs no offset.
 * Collision uses a circle body, which is unaffected by the sprite's rotation, so
 * bumping walls stays stable whichever way the player faces.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  /** How far the player's noise currently carries, in pixels. 0 means silent. */
  noiseRadius = 0;

  private readonly baseScale = RENDER.playerScale;
  private walkPhase = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, PLAYER_TEXTURE);
    this.sprite.setScale(this.baseScale);
    this.sprite.setDepth(40);
    this.sprite.setCollideWorldBounds(true);

    // Centre a circular collision body inside the sprite frame.
    const frameW = this.sprite.width;
    const frameH = this.sprite.height;
    const radius = Math.min(frameW, frameH) * 0.34;
    this.sprite.setCircle(radius, frameW / 2 - radius, frameH / 2 - radius);
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
   * Rotates the sprite to face the movement direction and animates a simple walk
   * (a gentle sway plus a small bounce) whose speed scales with the pace. When
   * idle the last facing is kept and the sprite settles back to rest.
   */
  applyMotion(intent: MovementIntent, deltaMs: number): void {
    const moving =
      intent.speed !== 'idle' && (intent.direction.x !== 0 || intent.direction.y !== 0);

    if (!moving) {
      this.walkPhase = 0;
      this.sprite.setScale(this.baseScale);
      return;
    }

    const face = Math.atan2(intent.direction.y, intent.direction.x);
    const stepRate = intent.speed === 'run' ? 20 : intent.speed === 'walk' ? 13 : 8;
    this.walkPhase += (deltaMs / 1000) * stepRate;

    // Sway wobbles the facing a few degrees; the circle body ignores rotation.
    const sway = Math.sin(this.walkPhase) * 0.1;
    this.sprite.setRotation(face + sway);

    // A small double-time bounce reads as footsteps. The tiny body change is
    // negligible for collision.
    const bob = 1 + Math.sin(this.walkPhase * 2) * 0.04;
    this.sprite.setScale(this.baseScale * bob);
  }
}
