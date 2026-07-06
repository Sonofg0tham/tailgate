import Phaser from 'phaser';
import { CAMERAS } from '../config/cameras';
import { Camera, type CameraState } from '../entities/Camera';
import type { WallRect } from '../world/BuildingMap';

/** One CCTV camera definition, as authored in public/data/cameras.json. */
export interface CameraDef {
  id: string;
  x: number;
  y: number;
  /** Facing in degrees: 0 = east, 90 = south, 180 = west, 270 = north. */
  baseFacingDeg: number;
  sweepHalfAngleDeg: number;
  sweepPeriodMs: number;
  circuitId: string;
  /** Optional cone range override, in tiles. Defaults to CONE_RANGE_PX. */
  rangeTiles?: number;
  /** Optional field of view override, in degrees. Defaults to DETECTION.cone.fovDegrees. */
  fovDegrees?: number;
}

/** The breaker panel, as authored in public/data/cameras.json. */
export interface BreakerDef {
  x: number;
  y: number;
  /** Circuit ids this breaker cuts power to when tripped. */
  circuits: string[];
}

/** The full shape of public/data/cameras.json. */
export interface CamerasData {
  cameras: CameraDef[];
  breaker: BreakerDef;
}

/** What the scene needs to react to after stepping every camera this frame. */
export interface CameraTick {
  /** Fresh curious pings this frame, one point per camera that just pinged. */
  investigatePoints: { x: number; y: number }[];
  /** True if any camera raised the building alert this frame. */
  raisedAlert: boolean;
  /** The HUD prompt line for the breaker, or null for none. */
  prompt: string | null;
}

/** Internal breaker state: when it was tripped and until when it is unusable. */
interface BreakerRuntime {
  def: BreakerDef;
  /** Scene-clock ts the kill window ends. 0 if never tripped. */
  killUntilMs: number;
  /** Scene-clock ts the cooldown ends and the breaker can trip again. */
  cooldownUntilMs: number;
}

/**
 * Owns every CCTV camera and the breaker that can knock a circuit's cameras
 * offline for a while. Cameras never touch the guard or mission state
 * directly: the scene reads investigatePoints and raisedAlert off the tick
 * result and decides what to do with them (guard.investigatePoint, mission
 * raiseAlert), exactly as the design blueprint requires.
 */
export class CameraSystem {
  private readonly cameras: Camera[];
  private readonly breaker: BreakerRuntime | undefined;
  /** The scene-clock ts from the most recent update(), used by debugLines(). */
  private lastNow = 0;

  constructor(scene: Phaser.Scene, walls: WallRect[], data: CamerasData | undefined) {
    this.cameras = (data?.cameras ?? []).map(
      (def) =>
        new Camera(
          scene,
          def.id,
          def.x,
          def.y,
          def.baseFacingDeg,
          def.sweepHalfAngleDeg,
          def.sweepPeriodMs,
          def.circuitId,
          walls
        )
    );
    this.breaker = data?.breaker
      ? { def: data.breaker, killUntilMs: 0, cooldownUntilMs: 0 }
      : undefined;
  }

  /**
   * Steps every camera, then the breaker. Returns the fresh curious pings and
   * whether any camera raised the alert this frame, plus the breaker prompt.
   */
  /**
   * `interactPressed` must be the rising edge of the interact control (a fresh
   * press this frame), not the held state. The breaker is a one-shot switch: if
   * it took the held state it would re-trip the instant the cooldown expired
   * while the player stands on it holding the key, which would defeat the
   * kill-then-cooldown pacing.
   */
  update(
    now: number,
    dtMs: number,
    playerX: number,
    playerY: number,
    closedDoors: WallRect[],
    interactPressed: boolean
  ): CameraTick {
    this.lastNow = now;
    const investigatePoints: { x: number; y: number }[] = [];
    let raisedAlert = false;

    for (const camera of this.cameras) {
      const result = camera.update(now, dtMs, playerX, playerY, closedDoors);
      if (result.curiousPing) {
        investigatePoints.push(result.curiousPing);
      }
      if (result.raiseAlertNow) {
        raisedAlert = true;
      }
    }

    const prompt = this.updateBreaker(now, playerX, playerY, interactPressed);

    return { investigatePoints, raisedAlert, prompt };
  }

  /** One debug line per camera plus a breaker line, for the debug overlay. */
  debugLines(): string[] {
    const lines = this.cameras.map(
      (camera) =>
        `${camera.id} ${camera.state.toUpperCase()} ${Math.round(camera.dwellMs)}ms ${
          camera.alive ? 'alive' : 'dead'
        }`
    );
    if (this.breaker) {
      const remaining = Math.max(0, this.breaker.cooldownUntilMs - this.lastNow);
      lines.push(`breaker cooldown ${Math.round(remaining)}ms`);
    }
    return lines;
  }

  setConesVisible(visible: boolean): void {
    for (const camera of this.cameras) {
      camera.setConeVisible(visible);
    }
  }

  private updateBreaker(
    now: number,
    playerX: number,
    playerY: number,
    interactPressed: boolean
  ): string | null {
    const breaker = this.breaker;
    if (!breaker) {
      return null;
    }

    const inRange =
      Phaser.Math.Distance.Between(playerX, playerY, breaker.def.x, breaker.def.y) <=
      CAMERAS.breaker.interactRangePx;

    const killed = now < breaker.killUntilMs;
    const cooling = !killed && now < breaker.cooldownUntilMs;

    if (killed) {
      return `CAMERAS DOWN ${Math.ceil((breaker.killUntilMs - now) / 1000)}s`;
    }
    if (cooling) {
      return `BREAKER COOLDOWN ${Math.ceil((breaker.cooldownUntilMs - now) / 1000)}s`;
    }

    if (inRange && interactPressed) {
      this.tripBreaker(breaker, now);
      return `CAMERAS DOWN ${Math.ceil(CAMERAS.breaker.killDurationMs / 1000)}s`;
    }

    return inRange ? '[E] KILL CAMERAS' : null;
  }

  private tripBreaker(breaker: BreakerRuntime, now: number): void {
    breaker.killUntilMs = now + CAMERAS.breaker.killDurationMs;
    breaker.cooldownUntilMs = breaker.killUntilMs + CAMERAS.breaker.cooldownMs;
    for (const camera of this.cameras) {
      if (breaker.def.circuits.includes(camera.circuitId)) {
        camera.kill(breaker.killUntilMs);
      }
    }
  }
}

/** Re-exported so the scene can type its camera state cue callback, if it wants to. */
export type { CameraState };
