import Phaser from 'phaser';
import { ART } from '../config/art';
import { PALETTE_HEX } from '../config/palette';

/**
 * The shared character animation: a walking sway and bob (extracted from the
 * player's Phase 5 feel), an idle breathing swell, and a code-drawn drop
 * shadow that grounds the sprite on the floor. Attach one to every moving
 * actor so nobody glides: the player passes its pace-based step rate, guards
 * and staff derive theirs from velocity via stepRateForSpeed().
 *
 * The circle physics body ignores rotation and the bob's scale change is
 * negligible for collision, so all of this stays presentation-only.
 */
export class CharacterAnimator {
  private readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly baseScale: number;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private walkPhase = 0;
  private breathePhase = 0;

  constructor(scene: Phaser.Scene, sprite: Phaser.Physics.Arcade.Sprite, baseScale: number) {
    this.sprite = sprite;
    this.baseScale = baseScale;

    const displayW = sprite.width * baseScale;
    this.shadow = scene.add
      .ellipse(
        sprite.x,
        sprite.y,
        displayW * ART.shadow.widthFactor,
        displayW * ART.shadow.heightFactor,
        PALETTE_HEX.base,
        ART.shadow.alpha
      )
      .setDepth(ART.shadow.depth);
  }

  /** Step rate for velocity-driven characters (guards, staff). */
  static stepRateForSpeed(speedPxPerSec: number): number {
    return Phaser.Math.Clamp(
      speedPxPerSec / ART.walk.pxPerStep,
      ART.walk.minStepRate,
      ART.walk.maxStepRate
    );
  }

  /**
   * Advances one frame and applies rotation, scale and the shadow. `facing`
   * is the raw heading in radians; the sway wobbles around it while moving.
   */
  update(dtMs: number, moving: boolean, stepRate: number, facing: number): void {
    const dtSec = dtMs / 1000;
    let bob: number;

    if (moving) {
      this.walkPhase += dtSec * stepRate;
      const sway = Math.sin(this.walkPhase) * ART.walk.swayRad;
      this.sprite.setRotation(facing + sway);
      // Double-time bounce reads as footsteps, exactly the Phase 5 numbers.
      bob = 1 + Math.sin(this.walkPhase * 2) * ART.walk.bobAmount;
    } else {
      this.walkPhase = 0;
      this.breathePhase += dtSec * ART.walk.breatheHz * Math.PI * 2;
      this.sprite.setRotation(facing);
      // A still character breathes instead of freezing.
      bob = 1 + Math.sin(this.breathePhase) * ART.walk.breatheAmount;
    }

    this.sprite.setScale(this.baseScale * bob);

    // The shadow stays on the floor: it counter-scales against the bob so the
    // sprite appears to lift off it slightly on each step.
    const w = this.sprite.width * this.baseScale;
    this.shadow.setPosition(this.sprite.x, this.sprite.y + w * ART.shadow.offsetFactor);
    this.shadow.setScale(2 - bob);
  }

  destroy(): void {
    this.shadow.destroy();
  }
}
