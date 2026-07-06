import Phaser from 'phaser';
import { THROW } from '../config/throw';

/** How long the noise ring lingers and fades after the bolt lands, ms. */
const RING_FADE_MS = 500;

/**
 * A thrown bolt. It flies in a straight line to the aimed spot, then lands and
 * makes a noise (a one-off ring that expands to the noise radius). The scene
 * passes an onLand callback that pulls nearby guards to investigate the spot.
 */
export class Bolt {
  private readonly dot: Phaser.GameObjects.Arc;
  private ring?: Phaser.GameObjects.Arc;
  private readonly target: Phaser.Math.Vector2;
  private readonly pos: Phaser.Math.Vector2;
  private readonly onLand: (x: number, y: number) => void;
  private landed = false;
  private ringAge = 0;

  constructor(
    scene: Phaser.Scene,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    onLand: (x: number, y: number) => void
  ) {
    this.pos = new Phaser.Math.Vector2(sx, sy);
    this.target = new Phaser.Math.Vector2(tx, ty);
    this.onLand = onLand;
    this.dot = scene.add.circle(sx, sy, 4, 0xc7cdd4).setDepth(42);
  }

  /** Advances the bolt. Returns true when it is fully finished and can be dropped. */
  update(scene: Phaser.Scene, dtMs: number): boolean {
    const dtSec = dtMs / 1000;

    if (!this.landed) {
      const step = THROW.boltSpeedPxPerSec * dtSec;
      const toTarget = this.target.clone().subtract(this.pos);
      if (toTarget.length() <= step) {
        this.pos.copy(this.target);
        this.dot.destroy();
        this.landed = true;
        this.onLand(this.target.x, this.target.y);
        this.ring = scene.add
          .circle(this.target.x, this.target.y, 4)
          .setStrokeStyle(2, 0xc7cdd4, 0.9)
          .setFillStyle(0, 0)
          .setDepth(42);
      } else {
        this.pos.add(toTarget.normalize().scale(step));
        this.dot.setPosition(this.pos.x, this.pos.y);
      }
      return false;
    }

    // Landed: expand and fade the noise ring, then finish.
    this.ringAge += dtMs;
    const progress = Math.min(this.ringAge / RING_FADE_MS, 1);
    if (this.ring) {
      this.ring.setRadius(4 + progress * THROW.noiseRadiusPx);
      this.ring.setAlpha(1 - progress);
    }
    if (this.ringAge >= RING_FADE_MS) {
      this.ring?.destroy();
      return true;
    }
    return false;
  }

  destroy(): void {
    this.dot.destroy();
    this.ring?.destroy();
  }
}
