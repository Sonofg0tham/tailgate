import Phaser from 'phaser';
import { RENDER } from '../config/tiles';
import { CharacterAnimator } from '../systems/CharacterAnimator';

/** Staff walking pace, pixels per second. Unhurried, they are just working. */
const STAFF_SPEED = 85;

/** How close counts as reaching a route node. */
const ARRIVE_EPS = 6;

/** One stop on a staff route, from public/data/staff.json. */
export interface StaffNode {
  x: number;
  y: number;
  pauseMs: number;
}

/** A staff member definition from public/data/staff.json. */
export interface StaffDef {
  id: string;
  /** Texture key (staff_a / staff_b). */
  sprite: string;
  /** Door ids this person can badge through. */
  badges: string[];
  route: StaffNode[];
}

/**
 * A member of staff going about their day on a fixed route. Not a guard: no
 * vision cone, no suspicion, they simply walk their loop and badge through any
 * door they are authorised for. Their value to the player is cover: tailgating
 * one through a badge gate is a way in.
 */
export class Staff {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly id: string;
  private readonly badges: string[];
  private readonly route: StaffNode[];
  private routeIndex = 0;
  private resumeAt = 0;
  private facing = 0;
  private readonly animator: CharacterAnimator;

  constructor(scene: Phaser.Scene, def: StaffDef) {
    this.id = def.id;
    this.badges = def.badges;
    this.route = def.route;

    const start = def.route[0] ?? { x: 0, y: 0, pauseMs: 0 };
    this.sprite = scene.physics.add.sprite(start.x, start.y, def.sprite);
    this.sprite.setScale(RENDER.playerScale);
    this.sprite.setDepth(39); // under the player and guard
    this.sprite.setCollideWorldBounds(true);
    const fw = this.sprite.width;
    const fh = this.sprite.height;
    const radius = Math.min(fw, fh) * 0.34;
    this.sprite.setCircle(radius, fw / 2 - radius, fh / 2 - radius);

    this.animator = new CharacterAnimator(scene, this.sprite, RENDER.playerScale);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  isAuthorisedFor(doorId: string): boolean {
    return this.badges.includes(doorId);
  }

  update(now: number, dtMs: number): void {
    this.patrol(now);
    // Same shared walk and shadow as the player and guard, so nobody glides.
    const velocity = this.body.velocity.length();
    this.animator.update(
      dtMs,
      velocity > 1,
      CharacterAnimator.stepRateForSpeed(velocity),
      this.facing
    );
  }

  private patrol(now: number): void {
    if (this.route.length === 0 || now < this.resumeAt) {
      this.body.setVelocity(0, 0);
      return;
    }
    const node = this.route[this.routeIndex];
    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE_EPS) {
      this.body.setVelocity(0, 0);
      this.resumeAt = now + node.pauseMs;
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      return;
    }
    this.facing = Math.atan2(dy, dx);
    this.body.setVelocity((dx / dist) * STAFF_SPEED, (dy / dist) * STAFF_SPEED);
  }

  private get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }
}
