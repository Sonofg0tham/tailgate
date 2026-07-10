import Phaser from 'phaser';
import { DOORS } from '../config/doors';
import { FONTS, PALETTE } from '../config/palette';
import { READABILITY } from '../config/readability';
import type { DoorKind, DoorRect } from '../world/BuildingMap';

/** Barrier fill colour per door type, all distinct from the brick walls. */
const CLOSED_COLOUR: Record<DoorKind, number> = {
  badge: 0x9098a0, // grey security gate
  smokers: 0x8a6d43, // wooden fire-exit door
  shutter: 0x6b7077, // metal roller shutter
};

/** Returns whether a scheduled door is in its open window at time `now`. */
function scheduleOpen(now: number, cfg: { openForMs: number; closedForMs: number; phaseMs: number }): boolean {
  const period = cfg.openForMs + cfg.closedForMs;
  const t = (now + cfg.phaseMs) % period;
  return t >= cfg.closedForMs; // closed first, then open
}

/**
 * One door filling a gap in the building's outer wall. Closed, it is a solid
 * barrier you collide with; open, the barrier and its collision switch off so
 * anyone can pass. Badge doors open only when staff badge through (then stay
 * open for the tailgate window); smokers' and shutter doors open on their own
 * repeating schedules.
 *
 * Every door carries a wall-mounted state lamp, readable across the map: a
 * green circle glow when open, an amber square glow when shut (shape and
 * colour both change, never colour alone). The door's name fades in above the
 * lamp as the player gets further away, so a trek across the car park is a
 * decision, not a gamble.
 */
export class Door {
  readonly rect: DoorRect;

  private isOpenNow = false;
  private tailgateCloseAt = 0; // badge doors only
  private readonly barrier: Phaser.GameObjects.Rectangle;
  private readonly lamp: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, rect: DoorRect) {
    this.rect = rect;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    this.barrier = scene.add
      .rectangle(cx, cy, rect.width, rect.height, CLOSED_COLOUR[rect.kind])
      .setDepth(11);
    scene.physics.add.existing(this.barrier, true);

    // The lamp and label render above the lighting veil (depth 25): a lit
    // fixture is visible in the dark, that is its whole job.
    this.lamp = scene.add.graphics().setDepth(26);
    this.label = scene.add
      .text(cx, rect.y - 26, rect.id.toUpperCase(), {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setAlpha(0);
    this.applyOpen(false);
  }

  get isOpen(): boolean {
    return this.isOpenNow;
  }

  get kind(): DoorKind {
    return this.rect.kind;
  }

  get id(): string {
    return this.rect.id;
  }

  /** The static barrier body, for colliders. */
  get body(): Phaser.Physics.Arcade.StaticBody {
    return this.barrier.body as Phaser.Physics.Arcade.StaticBody;
  }

  /** The barrier game object, for wiring colliders in the scene. */
  get gameObject(): Phaser.GameObjects.Rectangle {
    return this.barrier;
  }

  /** Centre of the door, for staff-proximity and tailgate checks. */
  get centreX(): number {
    return this.rect.x + this.rect.width / 2;
  }
  get centreY(): number {
    return this.rect.y + this.rect.height / 2;
  }

  /** Whether a point sits inside the door's opening (for tailgate checks). */
  contains(x: number, y: number): boolean {
    return (
      x >= this.rect.x &&
      x <= this.rect.x + this.rect.width &&
      y >= this.rect.y &&
      y <= this.rect.y + this.rect.height
    );
  }

  /**
   * An authorised staff member badged through: open for the tailgate window.
   * During lockdown badge doors deny everyone, staff included.
   */
  badge(now: number, lockdown = false): void {
    if (this.rect.kind !== 'badge' || lockdown) {
      return;
    }
    this.tailgateCloseAt = now + DOORS.tailgateWindowMs;
  }

  /**
   * Recomputes open/closed for this frame. In lockdown the badge doors deny all
   * and the smokers' door stays sealed; only the loading-dock shutter keeps its
   * delivery schedule, so it is the one way out. The player's position drives
   * the label fade: the further away they are, the stronger the door's name.
   */
  update(now: number, lockdown = false, playerX?: number, playerY?: number): void {
    let shouldOpen: boolean;
    switch (this.rect.kind) {
      case 'smokers':
        shouldOpen = !lockdown && scheduleOpen(now, DOORS.smokers);
        break;
      case 'shutter':
        shouldOpen = scheduleOpen(now, DOORS.shutter);
        break;
      case 'badge':
      default:
        shouldOpen = !lockdown && now < this.tailgateCloseAt;
        break;
    }
    if (shouldOpen !== this.isOpenNow) {
      this.applyOpen(shouldOpen);
    }

    if (playerX !== undefined && playerY !== undefined) {
      const { labelFadeStartPx, labelFadeFullPx, labelMaxAlpha } = READABILITY.doorLamp;
      const dist = Phaser.Math.Distance.Between(playerX, playerY, this.centreX, this.centreY);
      const t = Phaser.Math.Clamp(
        (dist - labelFadeStartPx) / (labelFadeFullPx - labelFadeStartPx),
        0,
        1
      );
      this.label.setAlpha(t * labelMaxAlpha);
    }
  }

  private applyOpen(open: boolean): void {
    this.isOpenNow = open;
    this.barrier.setVisible(!open);
    this.body.enable = !open;

    // The state lamp: green circle when open, amber square when shut, each
    // inside a soft glow of the same colour so it reads across the map.
    const { glowRadiusPx, coreRadiusPx } = READABILITY.doorLamp;
    const cx = this.rect.x + this.rect.width / 2;
    const py = this.rect.y - 10;
    const tint = open ? 0x36f06a : 0xffb000;
    this.lamp.clear();
    this.lamp.fillStyle(tint, 0.16);
    this.lamp.fillCircle(cx, py, glowRadiusPx);
    this.lamp.fillStyle(tint, 0.3);
    this.lamp.fillCircle(cx, py, glowRadiusPx * 0.6);
    this.lamp.fillStyle(tint, 1);
    if (open) {
      this.lamp.fillCircle(cx, py, coreRadiusPx);
    } else {
      this.lamp.fillRect(cx - coreRadiusPx, py - coreRadiusPx, coreRadiusPx * 2, coreRadiusPx * 2);
    }
  }
}
