import Phaser from 'phaser';
import { THROW } from '../config/throw';
import { Bolt } from '../entities/Bolt';

/**
 * Handles the distraction throw: aiming, the throw trigger, the live bolts and
 * the aim reticle. Aim is by mouse (keyboard players) or the right stick
 * (gamepad); throw is left-click or the right trigger. Kept out of the scene so
 * the scene just calls update() and reads how many bolts are left.
 *
 * When a bolt lands it calls the onNoise callback with the landing spot; the
 * scene turns that into a guard investigation.
 */
export class ThrowController {
  private boltsLeft = THROW.boltCount;
  private readonly bolts: Bolt[] = [];
  private readonly reticle: Phaser.GameObjects.Graphics;
  private prevThrow = false;
  private readonly onNoise: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, onNoise: (x: number, y: number) => void) {
    this.onNoise = onNoise;
    this.reticle = scene.add.graphics().setDepth(45);
  }

  get remaining(): number {
    return this.boltsLeft;
  }

  update(
    scene: Phaser.Scene,
    dtMs: number,
    playerX: number,
    playerY: number,
    pad: Phaser.Input.Gamepad.Gamepad | undefined
  ): void {
    const aim = this.computeAim(scene, playerX, playerY, pad);
    this.drawReticle(playerX, playerY, aim);

    const throwHeld = this.readThrow(scene, pad);
    if (throwHeld && !this.prevThrow && this.boltsLeft > 0) {
      this.bolts.push(new Bolt(scene, playerX, playerY, aim.x, aim.y, this.onNoise));
      this.boltsLeft -= 1;
    }
    this.prevThrow = throwHeld;

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (this.bolts[i].update(scene, dtMs)) {
        this.bolts.splice(i, 1);
      }
    }
  }

  /** The aim point, clamped to throw range. Right stick wins over the mouse. */
  private computeAim(
    scene: Phaser.Scene,
    px: number,
    py: number,
    pad: Phaser.Input.Gamepad.Gamepad | undefined
  ): Phaser.Math.Vector2 {
    const player = new Phaser.Math.Vector2(px, py);

    if (pad && pad.rightStick.length() >= THROW.aimDeadzone) {
      const dir = pad.rightStick.clone().normalize();
      return player.add(dir.scale(THROW.maxRangePx));
    }

    const pointer = scene.input.activePointer;
    const aim = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    const to = aim.clone().subtract(player);
    if (to.length() > THROW.maxRangePx) {
      return player.add(to.normalize().scale(THROW.maxRangePx));
    }
    return aim;
  }

  /** True while the throw control is pressed (left click or right trigger). */
  private readThrow(scene: Phaser.Scene, pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    if (pad && pad.R2 > 0.5) {
      return true;
    }
    return scene.input.activePointer.leftButtonDown();
  }

  private drawReticle(px: number, py: number, aim: Phaser.Math.Vector2): void {
    this.reticle.clear();
    if (this.boltsLeft <= 0) {
      return;
    }
    this.reticle.lineStyle(1, 0xc7cdd4, 0.3);
    this.reticle.lineBetween(px, py, aim.x, aim.y);
    this.reticle.lineStyle(1.5, 0xffb000, 0.9);
    this.reticle.strokeCircle(aim.x, aim.y, 8);
    this.reticle.lineBetween(aim.x - 12, aim.y, aim.x + 12, aim.y);
    this.reticle.lineBetween(aim.x, aim.y - 12, aim.x, aim.y + 12);
  }
}
