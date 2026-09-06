import Phaser from 'phaser';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { DISGUISE } from '../config/disguise';
import { LIGHTING } from '../config/lighting';
import { NAVIGATION } from '../config/navigation';
import { RENDER } from '../config/tiles';
import { getSettings } from '../state/settings';
import type { SpeedState } from '../input/InputState';
import { CharacterAnimator } from '../systems/CharacterAnimator';
import type { NavGrid, NavPoint } from '../systems/NavGrid';
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

/**
 * Everything a guard perceives about the player this frame, assembled by the
 * scene. The guard itself stays free of mission and settings state: the scene
 * decides whether the disguise is currently plausible (worn, not blown, site
 * calm, player not in a restricted zone) and the guard only applies the
 * close-range override, because distance is the guard's own knowledge.
 */
export interface GuardPerception {
  playerX: number;
  playerY: number;
  playerSpeed: SpeedState;
  closedDoors: WallRect[];
  /** Light level at the player, 0 dark to 1 lit. Darkness is cover. */
  lightLevel: number;
  /** True when a worn hi-vis should dampen the suspicion fill at range. */
  disguised: boolean;
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

export class Guard {
  /** Stable id from guards.json, for audio, the report and the debug view. */
  readonly id: string;
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
  /** True while a CURIOUS guard stands at the spot sweeping its cone. */
  private lookingAround = false;

  // The look-around at a patrol stop (Phase 21): the heading the guard
  // arrived on, when the stop began and how long it lasts.
  private pauseBaseFacing = 0;
  private pauseStartedAt = 0;
  private pauseLenMs = 0;

  private readonly onStateCue: (state: GuardState, previous: GuardState) => void;
  private readonly animator: CharacterAnimator;

  // Navigation (Phase 20 playtest fix). Before this the guard drove straight at
  // its target and pressed into whatever wall was in the way. It now walks a
  // path, and watches its own progress so it can never stay pinned.
  private readonly nav?: NavGrid;
  /** The current plan, world space. Reused in place, so following costs nothing. */
  private readonly path: NavPoint[] = [];
  private pathIndex = 0;
  private hasPlan = false;
  private planGoalX = 0;
  private planGoalY = 0;
  private lastPlanAt = Number.NEGATIVE_INFINITY;
  private planHoldUntil = 0;
  private navVersion = -1;
  /** Speed the guard is trying to make, which is what the stuck check expects. */
  private intendedSpeed = 0;
  private progressWindowFrom = 0;
  private progressMovedPx = 0;
  private progressExpectedPx = 0;
  private stuckStrikes = 0;
  private forceReplan = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    route: PatrolNode[],
    walls: WallRect[],
    onStateCue: (state: GuardState, previous: GuardState) => void,
    nav?: NavGrid
  ) {
    this.id = id;
    this.route = route;
    this.nav = nav;
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
    this.animator = new CharacterAnimator(scene, this.sprite, RENDER.playerScale);
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
  /** Where the guard last saw or heard the player: the spot it is heading for. */
  get lastSeenX(): number {
    return this.lastSeen.x;
  }
  get lastSeenY(): number {
    return this.lastSeen.y;
  }
  /** True while a CURIOUS guard has reached the spot and is sweeping its cone. */
  get isLookingAround(): boolean {
    return this.lookingAround;
  }

  /** Swaps the patrol route (e.g. adding cautious nodes when the alert rises). */
  setRoute(route: PatrolNode[]): void {
    this.route = route;
    this.routeIndex = route.length > 0 ? this.routeIndex % route.length : 0;
    this.clearPlan(); // the node under the index may be somewhere else entirely now
  }
  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get velocityX(): number {
    return this.body.velocity.x;
  }
  get velocityY(): number {
    return this.body.velocity.y;
  }
  get displacementX(): number {
    return this.body.deltaX();
  }
  get displacementY(): number {
    return this.body.deltaY();
  }

  /**
   * Advances the guard one frame: perceive the player, update state, move, and
   * redraw the cone. Returns what the scene must react to (spotted / caught).
   */
  update(now: number, dtMs: number, perception: GuardPerception): GuardTick {
    const dtSec = dtMs / 1000;
    const { playerX, playerY } = perception;

    // Closed doors block sight this frame just like walls do, and they block the
    // way just like walls do as well: a guard cannot open a shut door, so the
    // nav grid gets the same set before anything plans a route through one.
    this.cone.setDynamicOccluders(perception.closedDoors);
    this.nav?.setDynamicBlockers(perception.closedDoors);
    this.trackProgress(now, dtSec);
    this.perceive(perception, dtSec);
    const spottedNow = this.updateState(now);
    this.act(now, playerX, playerY);
    // Walk animation and shadow: the step rate follows however fast the guard
    // is actually moving, so an alert chase visibly hurries.
    const velocity = this.body.velocity.length();
    this.animator.update(
      dtMs,
      velocity > 1,
      CharacterAnimator.stepRateForSpeed(velocity),
      this.facing
    );
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

  private perceive(perception: GuardPerception, dtSec: number): void {
    const { playerX: px, playerY: py } = perception;
    this.sawPlayer = this.cone.canSee(this.x, this.y, this.facing, px, py);
    if (this.sawPlayer) {
      this.lastSeen.set(px, py);
      this.investigateUntil = 0; // re-seen: go to the fresh position, do not keep scanning old spot
      const dist = Math.hypot(px - this.x, py - this.y);
      const proximity = this.proximityFactor(dist);
      const speed = DETECTION.suspicion.speedFactor[perception.playerSpeed];
      // Darkness is cover: in the dark the fill slows toward the concealment floor.
      const darkness = Phaser.Math.Linear(
        LIGHTING.concealmentFloor,
        1,
        Phaser.Math.Clamp(perception.lightLevel, 0, 1)
      );
      // A plausible hi-vis slows the fill right down, but faces beat vests:
      // inside close range the disguise does nothing at all.
      const disguise =
        perception.disguised && dist > DISGUISE.closeRangePx ? DISGUISE.fillMultiplier : 1;
      this.suspicionValue +=
        DETECTION.suspicion.baseFillPerSecond * proximity * speed * darkness * disguise * dtSec;
    } else {
      this.suspicionValue -= DETECTION.suspicion.decayPerSecond * dtSec;
    }
    this.suspicionValue = Phaser.Math.Clamp(this.suspicionValue, 0, 100);
  }

  /** Fill multiplier from close (strong) to far (weak). */
  private proximityFactor(dist: number): number {
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
      this.onStateCue(this.guardState, previous);
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

  /** Combined speed scale: the alert-level multiplier and the assist option. */
  private speedScale(): number {
    const assist = getSettings().assistMode ? DETECTION.assist.guardSpeedScale : 1;
    return this.speedMultiplier * assist;
  }

  private act(now: number, playerX: number, playerY: number): void {
    const mult = this.speedScale();
    this.lookingAround = this.guardState === 'curious' && now < this.investigateUntil;
    switch (this.guardState) {
      case 'alert':
        // Chase the player's current position.
        this.moveToward(now, playerX, playerY, DETECTION.speed.chase * mult);
        break;
      case 'curious':
        if (now < this.investigateUntil) {
          // Arrived at the point of interest: look around by sweeping the cone.
          this.stop();
          this.facing = this.investigateBaseFacing + Math.sin(now / 350) * 0.7;
        } else if (
          this.moveToward(now, this.lastSeen.x, this.lastSeen.y, DETECTION.speed.investigate * mult)
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
      this.scanWhilePaused(now);
      return;
    }
    const node = this.route[this.routeIndex];
    if (this.moveToward(now, node.x, node.y, DETECTION.speed.patrol * this.speedScale())) {
      this.stop();
      this.resumeAt = now + node.pauseMs;
      this.pauseBaseFacing = this.facing;
      this.pauseStartedAt = now;
      this.pauseLenMs = node.pauseMs;
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
    }
  }

  /**
   * The look-around at a patrol stop (Phase 21). A pause long enough to be a
   * real stop sweeps the cone either side of the arrival heading, so a guard
   * at rest reads as a person checking the room rather than a mannequin, and
   * a stop becomes something to wait out instead of walk past. Short pauses
   * (a beat at a corner) stay still, so nothing twitches. Tuning, including
   * the off switch, lives in DETECTION.patrol.
   */
  private scanWhilePaused(now: number): void {
    const { minPauseForScanMs, scanAmplitudeRad, scanPeriodMs } = DETECTION.patrol;
    if (this.pauseLenMs < minPauseForScanMs || scanAmplitudeRad <= 0) {
      return;
    }
    const t = (now - this.pauseStartedAt) / scanPeriodMs;
    this.facing = this.pauseBaseFacing + Math.sin(t * Math.PI * 2) * scanAmplitudeRad;
  }

  /**
   * Walks toward a destination and faces the way it is going.
   *
   * Returns true once the guard has arrived, or once it has done everything it
   * usefully can: the spot turned out to be unreachable, or the guard gave up
   * after being pinned on the geometry. Every caller keeps exactly the contract
   * it had before pathfinding existed, so a patrol node still ticks over and an
   * investigation still turns into a look-around.
   */
  private moveToward(now: number, tx: number, ty: number, speed: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= NAVIGATION.follow.goalArriveEps) {
      this.clearPlan();
      this.stop();
      return true;
    }

    const nav = this.nav;
    if (!nav) {
      // No grid for this level: the old straight line, unchanged.
      this.driveTowards(dx, dy, dist, speed);
      return false;
    }

    // Pinned for too long. Stop shoving and report "as far as I can get", so the
    // caller moves on. This is the promise that a guard can never end up stuck
    // on a wall permanently, whatever the geometry does.
    if (this.stuckStrikes >= NAVIGATION.stuck.strikesBeforeGiveUp) {
      this.stuckStrikes = 0;
      this.forceReplan = false;
      this.planHoldUntil = now + NAVIGATION.stuck.giveUpCooldownMs;
      this.clearPlan();
      this.facing = Math.atan2(dy, dx);
      this.stop();
      return true;
    }

    // Fast path. Most patrol legs run straight down a clear corridor, and a
    // guard that can see the player can usually just walk at them. No search
    // needed, and it doubles as string pulling once a corner has been turned.
    if (nav.hasClearLine(this.x, this.y, tx, ty)) {
      this.clearPlan();
      this.driveTowards(dx, dy, dist, speed);
      return false;
    }

    this.ensurePlan(now, nav, tx, ty);
    if (!this.hasPlan) {
      // Either nothing is reachable (a shut door sealing the only way), or we
      // are simply between searches. Stand and look at the spot rather than
      // walking into the wall in front of us. The caller's own episode timeout
      // ends this, and the stuck watchdog gives up on it either way.
      this.facing = Math.atan2(dy, dx);
      this.holdStill(speed);
      return false;
    }

    const waypoint = this.currentWaypoint(nav);
    if (!waypoint) {
      if (dist > NAVIGATION.follow.finalApproachPx) {
        // Off the end of the plan and still a long way out, usually because the
        // guard was shoved off its route. Wait for the next search rather than
        // striking off across the map on a straight line.
        this.clearPlan();
        this.holdStill(speed);
        return false;
      }
      // Last stretch. No waypoint lands on the destination because it sits
      // inside the fattened geometry, so close the gap directly. If there is
      // genuinely no room, the stuck watchdog above ends it.
      this.driveTowards(dx, dy, dist, speed);
      return false;
    }
    const wx = waypoint.x - this.x;
    const wy = waypoint.y - this.y;
    this.driveTowards(wx, wy, Math.hypot(wx, wy), speed);
    return false;
  }

  /**
   * Plans a route if the current one is stale. Searching is deliberately rare:
   * a chase moves its goal every frame, and searching every frame would burn
   * time and twitch the guard between near-identical routes.
   */
  private ensurePlan(now: number, nav: NavGrid, tx: number, ty: number): void {
    if (now < this.planHoldUntil) {
      return; // cooling off after a give-up
    }
    const goalMoved =
      Math.hypot(tx - this.planGoalX, ty - this.planGoalY) > NAVIGATION.repath.goalMovedEps;
    const doorsChanged = this.navVersion !== nav.version;
    if (this.hasPlan && !goalMoved && !doorsChanged && !this.forceReplan) {
      return;
    }
    if (
      !doorsChanged &&
      !this.forceReplan &&
      now - this.lastPlanAt < NAVIGATION.repath.minIntervalMs
    ) {
      return;
    }

    this.lastPlanAt = now;
    this.forceReplan = false;
    this.navVersion = nav.version;
    this.planGoalX = tx;
    this.planGoalY = ty;
    this.pathIndex = 0;
    const found = nav.findPath(this.x, this.y, tx, ty, this.path);
    this.hasPlan = found !== null && found.length > 0;
  }

  /**
   * The waypoint to steer at, skipping any already reached. One look-ahead per
   * frame: if the node after this one is already in plain sight, cut across to
   * it. That turns corners into smooth diagonals instead of a visible stagger,
   * which matters for readability as much as for looks.
   */
  private currentWaypoint(nav: NavGrid): NavPoint | undefined {
    const eps = NAVIGATION.follow.waypointArriveEps;
    while (this.pathIndex < this.path.length) {
      const point = this.path[this.pathIndex];
      if (Math.hypot(point.x - this.x, point.y - this.y) > eps) {
        break;
      }
      this.pathIndex += 1;
    }
    if (this.pathIndex >= this.path.length) {
      return undefined;
    }
    const next = this.path[this.pathIndex + 1];
    if (next !== undefined && nav.hasClearLine(this.x, this.y, next.x, next.y)) {
      this.pathIndex += 1;
    }
    return this.path[this.pathIndex];
  }

  /**
   * The stuck watchdog. Comparing how far the body actually travelled against
   * how far it was trying to travel catches every flavour of pinned without
   * guessing at the cause: a wall, a door that shut in the guard's face, or a
   * destination inside geometry. One bad window forces a fresh search, which
   * fixes almost everything; a run of them makes the guard give up.
   */
  private trackProgress(now: number, dtSec: number): void {
    if (this.progressWindowFrom === 0) {
      this.progressWindowFrom = now;
    }
    // deltaX/deltaY are the completed physics step, so this is real travel, not
    // the velocity we asked for and may not have got.
    this.progressMovedPx += Math.hypot(this.body.deltaX(), this.body.deltaY());
    this.progressExpectedPx += this.intendedSpeed * dtSec;
    if (now - this.progressWindowFrom < NAVIGATION.stuck.windowMs) {
      return;
    }

    const expected = this.progressExpectedPx;
    const moved = this.progressMovedPx;
    this.progressWindowFrom = now;
    this.progressMovedPx = 0;
    this.progressExpectedPx = 0;
    if (expected < NAVIGATION.stuck.minExpectedPx) {
      this.stuckStrikes = 0; // standing still on purpose is not being stuck
      return;
    }
    if (moved >= expected * NAVIGATION.stuck.progressFraction) {
      this.stuckStrikes = 0;
      return;
    }
    this.stuckStrikes += 1;
    this.forceReplan = true;
  }

  private clearPlan(): void {
    this.hasPlan = false;
    this.pathIndex = 0;
  }

  /** Sets velocity toward a direction and points the guard (and its cone) that way. */
  private driveTowards(dx: number, dy: number, dist: number, speed: number): void {
    if (dist <= 0) {
      this.holdStill(speed); // standing exactly on it: keep the current facing
      return;
    }
    this.facing = Math.atan2(dy, dx);
    this.intendedSpeed = speed;
    this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  /** Holds position while still wanting to move, so the stuck watchdog counts it. */
  private holdStill(speed: number): void {
    this.intendedSpeed = speed;
    this.body.setVelocity(0, 0);
  }

  private stop(): void {
    this.intendedSpeed = 0;
    this.body.setVelocity(0, 0);
  }

  private get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  setConeVisible(visible: boolean): void {
    this.cone.setVisible(visible);
  }
}
