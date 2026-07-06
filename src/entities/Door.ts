import Phaser from 'phaser';
import { DOORS } from '../config/doors';
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
 * repeating schedules. A small pip above the door shows open (green) or shut.
 */
export class Door {
  readonly rect: DoorRect;

  private isOpenNow = false;
  private tailgateCloseAt = 0; // badge doors only
  private readonly barrier: Phaser.GameObjects.Rectangle;
  private readonly pip: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, rect: DoorRect) {
    this.rect = rect;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    this.barrier = scene.add
      .rectangle(cx, cy, rect.width, rect.height, CLOSED_COLOUR[rect.kind])
      .setDepth(11);
    scene.physics.add.existing(this.barrier, true);

    this.pip = scene.add.graphics().setDepth(13);
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

  /** An authorised staff member badged through: open for the tailgate window. */
  badge(now: number): void {
    if (this.rect.kind !== 'badge') {
      return;
    }
    this.tailgateCloseAt = now + DOORS.tailgateWindowMs;
  }

  /** Recomputes open/closed for this frame. */
  update(now: number): void {
    let shouldOpen: boolean;
    switch (this.rect.kind) {
      case 'smokers':
        shouldOpen = scheduleOpen(now, DOORS.smokers);
        break;
      case 'shutter':
        shouldOpen = scheduleOpen(now, DOORS.shutter);
        break;
      case 'badge':
      default:
        shouldOpen = now < this.tailgateCloseAt;
        break;
    }
    if (shouldOpen !== this.isOpenNow) {
      this.applyOpen(shouldOpen);
    }
  }

  private applyOpen(open: boolean): void {
    this.isOpenNow = open;
    this.barrier.setVisible(!open);
    this.body.enable = !open;

    // State pip above the door: green open, amber shut.
    const cx = this.rect.x + this.rect.width / 2;
    const py = this.rect.y - 10;
    this.pip.clear();
    this.pip.fillStyle(open ? 0x36f06a : 0xffb000, 1);
    this.pip.fillCircle(cx, py, 5);
  }
}
