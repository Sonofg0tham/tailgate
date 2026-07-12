import Phaser from 'phaser';
import { INPUT } from '../config/input';
import { THROW } from '../config/throw';
import { Bolt } from '../entities/Bolt';
import { recordBoltThrown } from '../state/runStats';
import { AimDisplayState } from './AimDisplayState';

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
  private readonly aimDisplay = new AimDisplayState();
  private prevPadThrow = false;
  private pointerThrowQueued = false;
  /** When the window last regained focus, to swallow the refocus click. */
  private refocusedAt = 0;
  private readonly onNoise: (x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    onNoise: (x: number, y: number) => void,
    initialBolts: number = THROW.boltCount,
    private readonly onThrow: () => void = () => {},
    private readonly onImpact: (x: number, y: number) => void = () => {}
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

  /**
   * Drops any queued click. The scene calls this on frames where a throw must
   * not fire (the CCTV console is open, so clicks belong to the multiplexer),
   * otherwise a click made there would launch a bolt the moment it closes.
   */
  discardQueued(): void {
    this.pointerThrowQueued = false;
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
    if (performance.now() - this.refocusedAt < INPUT.swallowWindowMs) {
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
    const controllerEngaged =
      pad !== undefined && pad.rightStick.length() >= THROW.aimDeadzone;
    const aim = this.computeAim(scene, playerX, playerY, pad);
    const pointer = scene.input.activePointer;
    const display = this.aimDisplay.update({
      dtMs,
      controllerEngaged,
      mouseX: pointer.x,
      mouseY: pointer.y,
      aimX: aim.x,
      aimY: aim.y,
    });
    this.drawTrajectory(
      playerX,
      playerY,
      { x: display.aimX, y: display.aimY },
      display.alpha
    );

    const padThrow = pad !== undefined && pad.R2 > 0.5;
    const throwRequested = this.pointerThrowQueued || (padThrow && !this.prevPadThrow);
    this.pointerThrowQueued = false;
    this.prevPadThrow = padThrow;

    if (throwRequested && this.boltsLeft > 0) {
      this.onThrow();
      this.bolts.push(new Bolt(scene, playerX, playerY, aim.x, aim.y, (x, y) => {
        this.onImpact(x, y);
        this.onNoise(x, y);
      }));
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

  private drawTrajectory(
    px: number,
    py: number,
    aim: { x: number; y: number },
    alpha: number
  ): void {
    this.reticle.clear();
    if (this.boltsLeft <= 0 || alpha <= 0) {
      return;
    }

    const dx = aim.x - px;
    const dy = aim.y - py;
    const distance = Math.hypot(dx, dy);
    const spacing = 18;
    this.reticle.fillStyle(0xc7cdd4, 0.48 * alpha);
    for (let along = spacing; along < distance; along += spacing) {
      const t = along / distance;
      this.reticle.fillCircle(px + dx * t, py + dy * t, 1.6);
    }
    this.reticle.fillStyle(0xffb000, 0.85 * alpha);
    this.reticle.fillCircle(aim.x, aim.y, 3);
  }
}
