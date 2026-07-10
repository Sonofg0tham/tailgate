import Phaser from 'phaser';
import { THROW } from '../config/throw';
import { Bolt } from '../entities/Bolt';
import { recordBoltThrown } from '../state/runStats';

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
  private boltsLeft: number;
  private readonly bolts: Bolt[] = [];
  private readonly reticle: Phaser.GameObjects.Graphics;
  private prevPadThrow = false;
  private pointerThrowQueued = false;
  /** When the window last regained focus, to swallow the refocus click. */
  private refocusedAt = 0;
  private readonly onNoise: (x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    onNoise: (x: number, y: number) => void,
    initialBolts: number = THROW.boltCount
  ) {
    this.onNoise = onNoise;
    this.boltsLeft = initialBolts;
    this.reticle = scene.add.graphics().setDepth(45);

    // Throws come from real pointerdown events on this scene, not from polling
    // the button state. Polling made every stray click a throw: the click that
    // refocuses the window after alt-tab, or a press carried over from another
    // screen, each quietly cost a bolt and a report finding.
    scene.input.on('pointerdown', this.onPointerDown, this);

    const onRefocus = (): void => {
      this.refocusedAt = performance.now();
    };
    scene.game.events.on(Phaser.Core.Events.FOCUS, onRefocus);
    scene.game.events.on(Phaser.Core.Events.VISIBLE, onRefocus);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.FOCUS, onRefocus);
      scene.game.events.off(Phaser.Core.Events.VISIBLE, onRefocus);
    });
  }

  /** Queues a throw for the next update, unless the click is window admin. */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0) {
      return;
    }
    // The click that gives the window focus back is not a throw. Depending on
    // the platform the focus lands just before or just after the pointer event,
    // so check both sides: the document still unfocused, or focus so fresh it
    // must have come from this same click.
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      return;
    }
    if (performance.now() - this.refocusedAt < 250) {
      return;
    }
    this.pointerThrowQueued = true;
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

    const padThrow = pad !== undefined && pad.R2 > 0.5;
    const throwRequested = this.pointerThrowQueued || (padThrow && !this.prevPadThrow);
    this.pointerThrowQueued = false;
    this.prevPadThrow = padThrow;

    if (throwRequested && this.boltsLeft > 0) {
      this.bolts.push(new Bolt(scene, playerX, playerY, aim.x, aim.y, this.onNoise));
      this.boltsLeft -= 1;
      recordBoltThrown();
    }

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
