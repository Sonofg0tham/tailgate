import Phaser from 'phaser';
import { DETECTION } from '../config/detection';
import { Guard, type GuardPerception, type GuardState, type PatrolNode } from '../entities/Guard';
import type { NavGrid } from './NavGrid';
import type { WallRect } from '../world/BuildingMap';

/** One guard entry in a level's guards.json. */
export interface GuardDef {
  id: string;
  route: PatrolNode[];
  /** Extra patrol nodes added while the site is cautious or on lockdown. */
  cautiousExtra?: PatrolNode[];
}

/** What the scene must react to after every guard has taken its turn. */
export interface RosterTick {
  /** Some guard freshly reached ALERT this frame. */
  spottedNow: boolean;
  /** The guard that touched the player this frame, or null. */
  caughtBy: Guard | null;
}

/** What the radio rule produced this frame. */
export interface RadioTick {
  /** At least one guard is currently ALERT. */
  anyAlert: boolean;
  /** Guards that radioed the building this frame (normally none or one). */
  radioed: Guard[];
}

/** A point a guard should be told to investigate. */
export interface GuardTorch {
  x: number;
  y: number;
  facing: number;
}

/** Per-guard runtime the scene used to keep for its single guard. */
interface GuardRuntime {
  def: GuardDef;
  /** Already radioed during the current ALERT episode. */
  radioed: boolean;
  /** Last frame's position, so footfall rings only spawn while moving. */
  prevX: number;
  prevY: number;
  hasPrev: boolean;
  /** Scene-clock ts of the last footfall ring. */
  lastStepAt: number;
}

/**
 * Every guard on site (Phase 21). Until now the scene took the first entry in
 * guards.json and ignored the rest, so each contract had exactly one patrol
 * and most of the floor plan was never watched by a person. The roster runs
 * as many guards as the data lists, each with its own route, alert extras,
 * radio episode and footfall cadence, and answers the questions the scene
 * used to put to its one guard: who is nearest, does anyone see the player,
 * who heard that noise, who is touching the player.
 *
 * Nothing here decides anything about detection: each Guard still perceives
 * and reacts on its own. The roster only fans the scene's calls out and
 * gathers the answers back.
 */
export class GuardRoster {
  readonly guards: Guard[] = [];
  private readonly runtime = new Map<Guard, GuardRuntime>();

  constructor(
    scene: Phaser.Scene,
    defs: readonly GuardDef[],
    walls: WallRect[],
    nav: NavGrid,
    onStateCue: (guard: Guard, state: GuardState, previous: GuardState) => void
  ) {
    for (const def of defs) {
      if (def.route.length === 0) {
        continue;
      }
      // The cue closure fires from update(), long after this assignment.
      const guard: Guard = new Guard(
        scene,
        def.id,
        def.route,
        walls,
        (state, previous) => onStateCue(guard, state, previous),
        nav
      );
      this.guards.push(guard);
      this.runtime.set(guard, {
        def,
        radioed: false,
        prevX: 0,
        prevY: 0,
        hasPrev: false,
        lastStepAt: 0,
      });
    }
  }

  get size(): number {
    return this.guards.length;
  }

  /**
   * Steps every guard. The scene supplies each guard's perception (it owns
   * the light model and the disguise rules); the roster gathers the results.
   */
  update(
    now: number,
    dtMs: number,
    perceive: (guard: Guard) => GuardPerception
  ): RosterTick {
    const tick: RosterTick = { spottedNow: false, caughtBy: null };
    for (const guard of this.guards) {
      const result = guard.update(now, dtMs, perceive(guard));
      if (result.spottedNow) {
        tick.spottedNow = true;
      }
      if (result.caughtPlayer && tick.caughtBy === null) {
        tick.caughtBy = guard;
      }
    }
    return tick;
  }

  /** The guard closest to a point, or undefined with no guards on site. */
  nearestTo(x: number, y: number): Guard | undefined {
    let best: Guard | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const guard of this.guards) {
      const dist = Phaser.Math.Distance.Between(x, y, guard.x, guard.y);
      if (dist < bestDist) {
        best = guard;
        bestDist = dist;
      }
    }
    return best;
  }

  anyCanSeePlayer(): boolean {
    return this.guards.some((guard) => guard.canSeePlayer);
  }

  anyAlert(): boolean {
    return this.guards.some((guard) => guard.state === 'alert');
  }

  /** True if any guard is within `radiusPx` of the point (a bump, a catch). */
  anyWithin(x: number, y: number, radiusPx: number): boolean {
    return this.guards.some(
      (guard) => Phaser.Math.Distance.Between(x, y, guard.x, guard.y) <= radiusPx
    );
  }

  /**
   * A noise at a point: every guard within earshot investigates it. Returns
   * how many heard it, so the scene can tell a wasted throw from a good one.
   */
  hearNoise(x: number, y: number, radiusPx: number): number {
    let heard = 0;
    for (const guard of this.guards) {
      if (Phaser.Math.Distance.Between(x, y, guard.x, guard.y) <= radiusPx) {
        guard.investigatePoint(x, y);
        heard += 1;
      }
    }
    return heard;
  }

  /**
   * A tip-off with no range (a camera ping over the radio): the nearest unit
   * responds, the rest keep their rounds. One responder keeps a camera from
   * emptying the whole building onto one spot.
   */
  dispatchNearest(x: number, y: number): Guard | undefined {
    const guard = this.nearestTo(x, y);
    guard?.investigatePoint(x, y);
    return guard;
  }

  /** Applies the building alert level: faster guards, wider patrols. */
  applyAlertLevel(level: number): void {
    const speed =
      level >= 2
        ? DETECTION.alert.level2SpeedMult
        : level >= 1
          ? DETECTION.alert.level1SpeedMult
          : 1;
    for (const guard of this.guards) {
      const runtime = this.runtime.get(guard);
      if (!runtime) {
        continue;
      }
      guard.speedMultiplier = speed;
      const extra = runtime.def.cautiousExtra ?? [];
      guard.setRoute(level >= 1 ? [...runtime.def.route, ...extra] : runtime.def.route);
    }
  }

  /**
   * The radio rule, per guard: an ALERT guard raises the building alert level
   * once its alert has lasted `radioAfterMs`, unless the player broke line of
   * sight first. Each guard radios at most once per ALERT episode.
   */
  radio(now: number, radioAfterMs: number): RadioTick {
    const tick: RadioTick = { anyAlert: false, radioed: [] };
    for (const guard of this.guards) {
      const runtime = this.runtime.get(guard);
      if (!runtime) {
        continue;
      }
      if (guard.state !== 'alert') {
        runtime.radioed = false;
        continue;
      }
      tick.anyAlert = true;
      if (
        !runtime.radioed &&
        guard.alertSince > 0 &&
        now - guard.alertSince >= radioAfterMs &&
        guard.canSeePlayer
      ) {
        runtime.radioed = true;
        tick.radioed.push(guard);
      }
    }
    return tick;
  }

  /** Whether the guard has already radioed this episode (the ring is done). */
  hasRadioed(guard: Guard): boolean {
    return this.runtime.get(guard)?.radioed ?? false;
  }

  /**
   * Guards whose footfall should ring this frame: moving, within the
   * listener's range, and past the cadence since their last ring. Also
   * advances the movement memory, so call it exactly once per frame.
   */
  footfalls(
    now: number,
    listenerX: number,
    listenerY: number,
    rangePx: number,
    intervalMs: number
  ): Guard[] {
    const stepped: Guard[] = [];
    for (const guard of this.guards) {
      const runtime = this.runtime.get(guard);
      if (!runtime) {
        continue;
      }
      const moved =
        runtime.hasPrev &&
        (Math.abs(guard.x - runtime.prevX) > 0.5 || Math.abs(guard.y - runtime.prevY) > 0.5);
      runtime.prevX = guard.x;
      runtime.prevY = guard.y;
      runtime.hasPrev = true;
      const inRange =
        Phaser.Math.Distance.Between(listenerX, listenerY, guard.x, guard.y) <= rangePx;
      if (moved && inRange && now - runtime.lastStepAt >= intervalMs) {
        runtime.lastStepAt = now;
        stepped.push(guard);
      }
    }
    return stepped;
  }

  /** Every guard's sightline as a light source, for the light model. */
  torches(): GuardTorch[] {
    return this.guards.map((guard) => ({ x: guard.x, y: guard.y, facing: guard.facingAngle }));
  }

  setConesVisible(visible: boolean): void {
    for (const guard of this.guards) {
      guard.setConeVisible(visible);
    }
  }
}
