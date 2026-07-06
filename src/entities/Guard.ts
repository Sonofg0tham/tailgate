import Phaser from 'phaser';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { RENDER } from '../config/tiles';
import type { SpeedState } from '../input/InputState';
import { VisionCone, type ConeEdge } from '../systems/VisionCone';
import type { WallRect } from '../world/BuildingMap';

export type GuardState = 'patrol' | 'curious' | 'alert';

/** One stop on a patrol route, from public/data/guards.json. */
export interface PatrolNode {
  x: number;
  y: number;
  pauseMs: number;
}

/** Result of a guard update the scene needs to react to. */
export interface GuardTick {
  /** The guard just escalated to ALERT this frame (a fresh spot). */
  spottedNow: boolean;
  /** The guard is touching the player this frame (a catch). */
  caughtPlayer: boolean;
}

/** Cone colour per state. Alarm red is used only for ALERT, per the palette rules. */
const STATE_COLOUR: Record<GuardState, number> = {
  patrol: 0xc7cdd4, // cool grey, calm
  curious: 0xffb000, // clearance amber, noticing
  alert: 0xff3b30, // alarm red, detection
};

/** Cone edge style per state, so state never reads by colour alone. */
const STATE_EDGE: Record<GuardState, ConeEdge> = {
  patrol: 'solid',
  curious: 'dashed',
  alert: 'pulsing',
};

/** How close, in pixels, the guard must be to a target to count as arrived. */
const ARRIVE_EPS = 6;

export class Guard {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly cone: VisionCone;

  /** Movement speed multiplier, raised while the building is on alert. */
  speedMultiplier = 1;

  private guardState: GuardState = 'patrol';
  private suspicionValue = 0;
  private facing = 0;
  private alertSinceMs = 0; // when the current ALERT episode began, 0 when calm

  private route: PatrolNode[];
  private routeIndex = 0;
  private resumeAt = 0; // timestamp the guard resumes after a pause
  private readonly lastSeen = new Phaser.Math.Vector2();
  private giveUpAt = 0; // timestamp an ALERT guard gives up after losing sight
  private investigateUntil = 0; // timestamp a CURIOUS guard finishes looking around
  private investigateBaseFacing = 0; // facing the scan sweeps around
  private curiousDeadline = 0; // hard timeout on a CURIOUS episode
  private sawPlayer = false;

  private readonly onStateCue: (state: GuardState) => void;

  constructor(
    scene: Phaser.Scene,
    route: PatrolNode[],
    walls: WallRect[],
    onStateCue: (state: GuardState) => void
  ) {
    this.route = route;
    const start = route[0] ?? { x: 0, y: 0, pauseMs: 0 };

    this.sprite = scene.physics.add.sprite(start.x, start.y, 'guard');
    this.sprite.setScale(RENDER.playerScale);
    this.sprite.setDepth(41);
    this.sprite.setCollideWorldBounds(true);
    const fw = this.sprite.width;
    const fh = this.sprite.height;
    const radius = Math.min(fw, fh) * 0.34;
    this.sprite.setCircle(radius, fw / 2 - radius, fh / 2 - radius);

    this.cone = new VisionCone(scene, walls);
    this.onStateCue = onStateCue;
  }

  get state(): GuardState {
    return this.guardState;
  }
  get suspicion(): number {
    return this.suspicionValue;
  }
  get canSeePlayer(): boolean {
    return this.sawPlayer;
  }
  get facingAngle(): number {
    return this.facing;
  }
  /** Scene-clock ms when the current ALERT episode started, or 0 if not alert. */
  get alertSince(): number {
    return this.alertSinceMs;
  }

  /** Swaps the patrol route (e.g. adding cautious nodes when the alert rises). */
  setRoute(route: PatrolNode[]): void {
    this.route = route;
    this.routeIndex = route.length > 0 ? this.routeIndex % route.length : 0;
  }
  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /**
   * Advances the guard one frame: perceive the player, update state, move, and
   * redraw the cone. Returns what the scene must react to (spotted / caught).
   */
  update(
    now: number,
    dtMs: number,
    playerX: number,
    playerY: number,
    playerSpeed: SpeedState,
    closedDoors: WallRect[] = []
  ): GuardTick {
    const dtSec = dtMs / 1000;

    // Closed doors block sight this frame just like walls do.
    this.cone.setDynamicOccluders(closedDoors);
    this.perceive(playerX, playerY, playerSpeed, dtSec);
    const spottedNow = this.updateState(now);
    this.act(now, playerX, playerY);
    this.sprite.setRotation(this.facing);
    this.cone.render(
      this.x,
      this.y,
      this.facing,
      STATE_COLOUR[this.guardState],
      STATE_EDGE[this.guardState],
      now
    );

    const caughtPlayer =
      Math.hypot(playerX - this.x, playerY - this.y) <= DETECTION.detainRadius;

    return { spottedNow, caughtPlayer };
  }

  /**
   * Pulls the guard to investigate a point: a heard noise (thrown bolt or the
   * player's footsteps) or a witnessed tailgate. Spikes suspicion to CURIOUS and
   * retargets, unless the guard is already chasing (a distant noise should not
   * distract a guard that already has the player).
   */
  investigatePoint(x: number, y: number): void {
    if (this.guardState === 'alert') {
      return;
    }
    this.lastSeen.set(x, y);
    // Nudge suspicion up to CURIOUS so updateState takes it there (and arms the
    // episode timeout on entry). Retarget to the fresh noise; the deadline in
    // updateState remains the backstop so continuous noise still times out.
    this.suspicionValue = Math.max(
      this.suspicionValue,
      DETECTION.suspicion.curiousThreshold + 5
    );
    this.investigateUntil = 0;
  }

  private perceive(px: number, py: number, playerSpeed: SpeedState, dtSec: number): void {
    this.sawPlayer = this.cone.canSee(this.x, this.y, this.facing, px, py);
    if (this.sawPlayer) {
      this.lastSeen.set(px, py);
      this.investigateUntil = 0; // re-seen: go to the fresh position, do not keep scanning old spot
      const proximity = this.proximityFactor(px, py);
      const speed = DETECTION.suspicion.speedFactor[playerSpeed];
      this.suspicionValue += DETECTION.suspicion.baseFillPerSecond * proximity * speed * dtSec;
    } else {
      this.suspicionValue -= DETECTION.suspicion.decayPerSecond * dtSec;
    }
    this.suspicionValue = Phaser.Math.Clamp(this.suspicionValue, 0, 100);
  }

  /** Fill multiplier from close (strong) to far (weak). */
  private proximityFactor(px: number, py: number): number {
    const dist = Math.hypot(px - this.x, py - this.y);
    const t = Phaser.Math.Clamp(dist / CONE_RANGE_PX, 0, 1);
    return Phaser.Math.Linear(
      DETECTION.suspicion.proximityAtPointBlank,
      DETECTION.suspicion.proximityAtMaxRange,
      t
    );
  }

  /** Applies state transitions. Returns true if the guard freshly reached ALERT. */
  private updateState(now: number): boolean {
    const previous = this.guardState;

    if (this.suspicionValue >= DETECTION.suspicion.alertAt) {
      this.guardState = 'alert';
      this.giveUpAt = now + DETECTION.timing.alertGiveUpMs;
      this.investigateUntil = 0;
    } else if (this.guardState === 'alert') {
      // Chasing: keep the give-up clock alive while the player is in sight.
      if (this.sawPlayer) {
        this.giveUpAt = now + DETECTION.timing.alertGiveUpMs;
      } else if (now >= this.giveUpAt) {
        if (this.suspicionValue > 0) {
          this.enterCurious(now);
        } else {
          this.guardState = 'patrol';
          this.investigateUntil = 0;
        }
      }
    } else if (this.guardState === 'curious') {
      // Already curious: end the episode when the look-around finishes or the
      // hard cap passes. Checked BEFORE the suspicion threshold below, so a
      // continuous noise flooring suspicion cannot keep the guard curious forever.
      const lookAroundDone = this.investigateUntil > 0 && now >= this.investigateUntil;
      if (lookAroundDone || now >= this.curiousDeadline) {
        this.guardState = 'patrol';
        this.investigateUntil = 0;
      }
    } else if (this.suspicionValue >= DETECTION.suspicion.curiousThreshold) {
      this.enterCurious(now);
    }

    // Track when the current ALERT episode began, for the radio rule.
    this.alertSinceMs = this.guardState === 'alert' ? this.alertSinceMs || now : 0;

    if (this.guardState !== previous) {
      this.onStateCue(this.guardState);
    }
    return this.guardState === 'alert' && previous !== 'alert';
  }

  /** Begins a fresh CURIOUS episode, arming its hard timeout once on entry. */
  private enterCurious(now: number): void {
    if (this.guardState !== 'curious') {
      this.curiousDeadline = now + DETECTION.timing.maxCuriousMs;
      this.investigateUntil = 0;
    }
    this.guardState = 'curious';
  }

  private act(now: number, playerX: number, playerY: number): void {
    const mult = this.speedMultiplier;
    switch (this.guardState) {
      case 'alert':
        // Chase the player's current position.
        this.moveToward(playerX, playerY, DETECTION.speed.chase * mult);
        break;
      case 'curious':
        if (now < this.investigateUntil) {
          // Arrived at the point of interest: look around by sweeping the cone.
          this.stop();
          this.facing = this.investigateBaseFacing + Math.sin(now / 350) * 0.7;
        } else if (
          this.moveToward(this.lastSeen.x, this.lastSeen.y, DETECTION.speed.investigate * mult)
        ) {
          // Just reached the last-seen spot: start the timed look-around.
          this.investigateBaseFacing = this.facing;
          this.investigateUntil = now + DETECTION.timing.investigatePauseMs;
        }
        break;
      case 'patrol':
      default:
        this.patrol(now);
        break;
    }
  }

  private patrol(now: number): void {
    if (this.route.length === 0) {
      this.stop();
      return;
    }
    if (now < this.resumeAt) {
      this.stop(); // pausing at a node
      return;
    }
    const node = this.route[this.routeIndex];
    if (this.moveToward(node.x, node.y, DETECTION.speed.patrol * this.speedMultiplier)) {
      this.stop();
      this.resumeAt = now + node.pauseMs;
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
    }
  }

  /** Moves toward a target and faces it. Returns true once within ARRIVE_EPS. */
  private moveToward(tx: number, ty: number, speed: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE_EPS) {
      this.body.setVelocity(0, 0);
      return true;
    }
    this.facing = Math.atan2(dy, dx);
    this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    return false;
  }

  private stop(): void {
    this.body.setVelocity(0, 0);
  }

  private get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  setConeVisible(visible: boolean): void {
    this.cone.setVisible(visible);
  }
}
