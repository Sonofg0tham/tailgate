import Phaser from 'phaser';
import { CAMERAS } from '../config/cameras';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { VisionCone, type ConeEdge } from '../systems/VisionCone';
import type { WallRect } from '../world/BuildingMap';

/** Mirrors Guard's state naming: calm grey, curious amber, alert alarm-red. */
export type CameraState = 'calm' | 'curious' | 'alert';

/** What a single camera update wants the CameraSystem to know about. */
export interface CameraTickResult {
  /** A fresh curious ping this frame (the player's position), or null. */
  curiousPing: { x: number; y: number } | null;
  /** True if this camera raised the building alert this frame. */
  raiseAlertNow: boolean;
}

/** Cone colour per state, same convention as Guard's STATE_COLOUR. */
const STATE_COLOUR: Record<CameraState, number> = {
  calm: 0xc7cdd4,
  curious: 0xffb000,
  alert: 0xff3b30,
};

/** Cone edge style per state, same convention as Guard's STATE_EDGE. */
const STATE_EDGE: Record<CameraState, ConeEdge> = {
  calm: 'solid',
  curious: 'dashed',
  alert: 'pulsing',
};

/** Small housing box size, in pixels, drawn under the cone. */
const HOUSING_SIZE = 14;

/** Radius of the small state dot and the offline pip, in pixels. */
const INDICATOR_RADIUS = 4;

/**
 * A single fixed CCTV camera. Sweeps its facing back and forth like a real
 * pan head, watches for the player with a shared VisionCone, and accumulates
 * continuous dwell time to ping curious then raise a full alert. A single
 * unseen frame resets the dwell to zero, so the player must be seen without a
 * break to trip it, exactly like a guard's suspicion but binary rather than a
 * meter.
 *
 * Killing the breaker circuit this camera is wired to sends it dark: it stops
 * perceiving and rendering its cone, and instead shows a small offline pip at
 * its housing so the player can read at a glance that the light is off.
 */
export class Camera {
  readonly id: string;
  readonly circuitId: string;

  private readonly cone: VisionCone;
  private readonly housing: Phaser.GameObjects.Graphics;
  private readonly indicator: Phaser.GameObjects.Graphics;

  private readonly baseX: number;
  private readonly baseY: number;
  private readonly baseFacingRad: number;
  private readonly sweepHalfRad: number;
  private readonly sweepPeriodMs: number;

  private cameraState: CameraState = 'calm';
  private dwellMsValue = 0;
  private curiousArmed = true;
  private alertArmed = true;
  private reArmAt = 0;
  private deadUntilMs = 0;
  private conesVisible = true;

  /** Silent seam for a future audio pass; wired to no-op here, no audio yet. */
  private readonly onStateCue: (state: CameraState) => void;

  /**
   * Note on rangeTiles/fovDegrees overrides: the shared VisionCone always uses
   * CONE_RANGE_PX and DETECTION.cone.fovDegrees internally and has no override
   * hook, so a CameraDef's rangeTiles/fovDegrees cannot currently change the
   * cone's actual geometry without editing VisionCone (out of scope here).
   * CameraSystem still reads and forwards the definition defaults so a future
   * VisionCone change can wire them straight through.
   */
  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    baseFacingDeg: number,
    sweepHalfAngleDeg: number,
    sweepPeriodMs: number,
    circuitId: string,
    walls: WallRect[],
    onStateCue: (state: CameraState) => void = () => {}
  ) {
    this.id = id;
    this.circuitId = circuitId;
    this.baseX = x;
    this.baseY = y;
    this.baseFacingRad = Phaser.Math.DegToRad(baseFacingDeg);
    this.sweepHalfRad = Phaser.Math.DegToRad(sweepHalfAngleDeg);
    this.sweepPeriodMs = sweepPeriodMs;
    this.onStateCue = onStateCue;

    this.cone = new VisionCone(scene, walls);
    this.housing = scene.add.graphics().setDepth(16);
    this.indicator = scene.add.graphics().setDepth(23);
    this.drawHousing();
  }

  get x(): number {
    return this.baseX;
  }
  get y(): number {
    return this.baseY;
  }
  get state(): CameraState {
    return this.cameraState;
  }
  get alive(): boolean {
    return this.deadUntilMs === 0;
  }
  get dwellMs(): number {
    return this.dwellMsValue;
  }

  /**
   * Advances the camera one frame: sweep the facing, perceive the player if
   * alive, and redraw the cone or the offline pip. Mirrors Guard.update's
   * shape so the scene can step cameras the same way it steps guards.
   */
  update(
    now: number,
    dtMs: number,
    playerX: number,
    playerY: number,
    closedDoors: WallRect[]
  ): CameraTickResult {
    const result: CameraTickResult = { curiousPing: null, raiseAlertNow: false };

    if (!this.alive) {
      if (now >= this.deadUntilMs) {
        this.reviveIfDue();
      } else {
        this.indicator.clear();
        this.drawOfflinePip();
        return result;
      }
    }

    const facing = this.currentFacing(now);
    this.cone.setDynamicOccluders(closedDoors);
    const sees = this.cone.canSee(this.baseX, this.baseY, facing, playerX, playerY);

    if (sees) {
      this.dwellMsValue += dtMs;

      if (this.curiousArmed && this.dwellMsValue >= CAMERAS.dwell.curiousAfterMs) {
        this.curiousArmed = false;
        this.setState('curious');
        result.curiousPing = { x: playerX, y: playerY };
      }
      if (this.alertArmed && this.dwellMsValue >= CAMERAS.dwell.alertAfterMs) {
        this.alertArmed = false;
        this.reArmAt = now + CAMERAS.reArmMs;
        this.setState('alert');
        result.raiseAlertNow = true;
      }
    } else {
      // A single unseen frame resets the dwell to zero (continuous dwell only).
      this.dwellMsValue = 0;
      // Re-arm only once unseen AND past the re-arm delay, so a fired episode
      // cannot immediately refire the instant the player steps back into view.
      if (now >= this.reArmAt) {
        this.curiousArmed = true;
        this.alertArmed = true;
        this.setState('calm');
      }
    }

    this.indicator.clear();
    this.cone.render(this.baseX, this.baseY, facing, STATE_COLOUR[this.cameraState], STATE_EDGE[this.cameraState], now);
    this.drawStateDot();

    return result;
  }

  /** Sends the camera dark until the given scene-clock timestamp. */
  kill(untilMs: number): void {
    this.deadUntilMs = untilMs;
    this.dwellMsValue = 0;
    this.curiousArmed = true;
    this.alertArmed = true;
    this.reArmAt = 0;
    this.setState('calm');
    this.cone.setVisible(false);
    this.indicator.clear();
    this.drawOfflinePip();
  }

  setConeVisible(visible: boolean): void {
    this.conesVisible = visible;
    this.cone.setVisible(visible && this.alive);
  }

  /** The swept facing angle for this instant, in radians. */
  private currentFacing(now: number): number {
    return (
      this.baseFacingRad +
      this.sweepHalfRad * Math.sin((2 * Math.PI * now) / this.sweepPeriodMs)
    );
  }

  private reviveIfDue(): void {
    this.deadUntilMs = 0;
    this.cone.setVisible(this.conesVisible);
  }

  private setState(state: CameraState): void {
    if (this.cameraState !== state) {
      this.cameraState = state;
      this.onStateCue(state);
    }
  }

  private drawHousing(): void {
    this.housing.clear();
    const half = HOUSING_SIZE / 2;
    this.housing.fillStyle(0x2a2f38, 1);
    this.housing.fillRect(this.baseX - half, this.baseY - half, HOUSING_SIZE, HOUSING_SIZE);
    this.housing.lineStyle(1.5, 0xc7cdd4, 0.8);
    this.housing.strokeRect(this.baseX - half, this.baseY - half, HOUSING_SIZE, HOUSING_SIZE);
  }

  private drawStateDot(): void {
    this.indicator.fillStyle(STATE_COLOUR[this.cameraState], 1);
    this.indicator.fillCircle(this.baseX, this.baseY, INDICATOR_RADIUS);
  }

  private drawOfflinePip(): void {
    this.indicator.fillStyle(CAMERAS.offlinePipColour, 1);
    this.indicator.fillCircle(this.baseX, this.baseY, INDICATOR_RADIUS);
  }
}

/** Default cone range in pixels, used when a CameraDef has no rangeTiles override. */
export const DEFAULT_CAMERA_RANGE_PX = CONE_RANGE_PX;

/** Default field of view in degrees, used when a CameraDef has no fovDegrees override. */
export const DEFAULT_CAMERA_FOV_DEGREES = DETECTION.cone.fovDegrees;
