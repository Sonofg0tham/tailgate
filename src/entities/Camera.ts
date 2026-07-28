import Phaser from 'phaser';
import { CAMERAS } from '../config/cameras';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { HIJACK } from '../config/hijack';
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

/**
 * Everything a camera can look like: the three perception states plus the two
 * ways it can be out of action. Kept separate from CameraState because being
 * dark or looped is not something the camera perceives its way into.
 */
type CameraDisplay = CameraState | 'offline' | 'looped';

/**
 * Lens tint per look. The housing sprite itself is never tinted, so the prop
 * always reads as a grey object with one coloured eye rather than a coloured
 * blob. Colour is only ever half the signal: see drawBadge for the shapes.
 */
const DISPLAY_TINT: Record<CameraDisplay, number> = {
  ...STATE_COLOUR,
  offline: CAMERAS.offlinePipColour,
  looped: HIJACK.frozenConeColour,
};

/** The four corner directions, hoisted so the looped badge allocates nothing. */
const CORNER_SIGNS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** How bright the lens burns in each family of looks. */
function lensAlphaFor(display: CameraDisplay): number {
  if (display === 'offline') {
    return CAMERAS.art.lensAlpha.offline;
  }
  if (display === 'looped') {
    return CAMERAS.art.lensAlpha.looped;
  }
  return CAMERAS.art.lensAlpha.live;
}

/**
 * A single fixed CCTV camera. Sweeps its facing back and forth like a real
 * pan head, watches for the player with a shared VisionCone, and accumulates
 * continuous dwell time to ping curious then raise a full alert. A single
 * unseen frame resets the dwell to zero, so the player must be seen without a
 * break to trip it, exactly like a guard's suspicion but binary rather than a
 * meter.
 *
 * The prop is two sprites built by tools/blender/build_camera_sprite.py: a
 * grey housing (wall bracket, tapered body, drooping lens barrel) rotated to
 * the camera's base facing, and a white lens disc over its muzzle that the
 * game tints per state. The old flat grey square is gone; seven cameras in a
 * level now read as seven cameras, each visibly pointing somewhere.
 *
 * Killing the breaker circuit this camera is wired to sends it dark: it stops
 * perceiving and rendering its cone, dims the housing and strikes it through
 * with a slashed square, so the player can read at a glance that the light is
 * off. Looping its feed from the console shows viewfinder corners and a slowly
 * turning dashed ring instead.
 */
export class Camera {
  readonly id: string;
  readonly circuitId: string;

  private readonly cone: VisionCone;
  private readonly housing: Phaser.GameObjects.Image;
  private readonly lens: Phaser.GameObjects.Image;
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
  /** Scene-clock ts a looped feed unfreezes, 0 when live. */
  private frozenUntilMs = 0;
  /** Scene-clock ts the camera can be looped again after a re-sync. */
  private freezeCooldownUntilMs = 0;
  /** The sweep angle at the instant the feed was looped: the picture holds. */
  private frozenFacingRad = 0;
  /** The look currently applied to the sprites. Null until the first apply. */
  private displayState: CameraDisplay | null = null;
  /** The look the badge graphics were last drawn for, so static badges redraw once. */
  private badgeDrawnFor: CameraDisplay | null = null;

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
    // Depth 16 keeps the housing with the rest of the world dressing, so the
    // lighting veil (25) dims it like any other object. The lens and the state
    // badges sit at 23, above that veil, because state has to stay readable in
    // a dark room. Both depths are unchanged from the old flat square.
    this.housing = scene.add
      .image(x, y, CAMERAS.art.housingKey)
      .setDepth(16)
      .setScale(CAMERAS.art.scale)
      .setRotation(this.baseFacingRad);
    this.lens = scene.add
      .image(x, y, CAMERAS.art.lensKey)
      .setDepth(23)
      .setScale(CAMERAS.art.scale)
      .setRotation(this.baseFacingRad);
    // Added after the lens so that, at equal depth, the badges draw on top.
    this.indicator = scene.add.graphics().setDepth(23);
    this.applyDisplay('calm', 0);
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

  isFrozen(now: number): boolean {
    return now < this.frozenUntilMs;
  }

  /** Milliseconds of loop remaining, 0 when live. */
  frozenRemainingMs(now: number): number {
    return Math.max(0, this.frozenUntilMs - now);
  }

  /** Milliseconds until this camera can be looped again, 0 when ready. */
  freezeCooldownRemainingMs(now: number): number {
    return Math.max(0, this.freezeCooldownUntilMs - now);
  }

  /**
   * Loops this camera's feed: detection stops and the rendered sweep holds
   * its current angle until the loop ends. The camera then re-syncs before it
   * can be looped again. Never colour alone: frozen reads as a halted sweep,
   * a dashed dim cone and a hollow ring pip, plus the console's audio cue.
   */
  freeze(now: number): void {
    this.frozenUntilMs = now + HIJACK.freezeDurationMs;
    this.freezeCooldownUntilMs = this.frozenUntilMs + HIJACK.cameraCooldownMs;
    this.frozenFacingRad = this.currentFacing(now);
    this.dwellMsValue = 0;
    this.curiousArmed = true;
    this.alertArmed = true;
    this.reArmAt = 0;
    this.setState('calm');
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
        this.applyDisplay('offline', now);
        return result;
      }
    }

    // A looped feed: no perception, the cone holds its angle, dim and dashed.
    if (this.isFrozen(now)) {
      this.cone.render(
        this.baseX,
        this.baseY,
        this.frozenFacingRad,
        HIJACK.frozenConeColour,
        'dashed',
        now
      );
      this.applyDisplay('looped', now);
      return result;
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

    this.cone.render(this.baseX, this.baseY, facing, STATE_COLOUR[this.cameraState], STATE_EDGE[this.cameraState], now);
    this.applyDisplay(this.cameraState, now);

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
    // The offline badge is static, so the timestamp here is never read.
    this.applyDisplay('offline', 0);
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

  /**
   * Puts the camera into one of the five looks. The lens tint and the housing
   * dimming only touch the sprites when the look actually changes, and the
   * badge is only redrawn when it changes or when it is the turning looped
   * ring, so a calm camera costs nothing per frame and nothing is allocated.
   */
  private applyDisplay(display: CameraDisplay, now: number): void {
    if (display !== this.displayState) {
      this.displayState = display;
      this.lens.setTint(DISPLAY_TINT[display]);
      this.lens.setAlpha(lensAlphaFor(display));
      this.housing.setAlpha(
        display === 'offline' ? CAMERAS.art.offlineHousingAlpha : 1
      );
    }
    if (display === 'looped' || this.badgeDrawnFor !== display) {
      this.drawBadge(display, now);
    }
  }

  /**
   * The state badge drawn around the housing. Every look has its own SHAPE, so
   * the state survives with no colour vision at all, which is the same rule the
   * cone edge styles follow:
   *   calm     nothing, a quiet camera stays quiet and the level stays calm
   *   curious  one ring
   *   alert    one ring plus four radiating ticks, visibly busier
   *   offline  a square struck through with a diagonal slash
   *   looped   four viewfinder corners plus a slowly turning dashed ring
   */
  private drawBadge(display: CameraDisplay, now: number): void {
    const badge = this.indicator;
    const { badgeRadiusPx, badgeLineWidthPx } = CAMERAS.art;
    badge.clear();
    this.badgeDrawnFor = display;

    if (display === 'calm') {
      return;
    }
    if (display === 'looped') {
      this.drawLoopedBadge(now);
      return;
    }
    if (display === 'offline') {
      // A struck-out square. No other look draws a square or a slash, so a dark
      // camera can never be misread as a busy one.
      badge.lineStyle(badgeLineWidthPx, DISPLAY_TINT.offline, 0.85);
      badge.strokeRect(
        this.baseX - badgeRadiusPx,
        this.baseY - badgeRadiusPx,
        badgeRadiusPx * 2,
        badgeRadiusPx * 2
      );
      badge.lineBetween(
        this.baseX - badgeRadiusPx,
        this.baseY - badgeRadiusPx,
        this.baseX + badgeRadiusPx,
        this.baseY + badgeRadiusPx
      );
      return;
    }

    // Curious and alert both wear the ring; alert adds the ticks on top.
    badge.lineStyle(badgeLineWidthPx, DISPLAY_TINT[display], 0.9);
    badge.strokeCircle(this.baseX, this.baseY, badgeRadiusPx);
    if (display === 'alert') {
      for (let i = 0; i < CORNER_SIGNS.length; i += 1) {
        const angle = Math.PI / 4 + (i * Math.PI) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        badge.lineBetween(
          this.baseX + cos * (badgeRadiusPx + 2),
          this.baseY + sin * (badgeRadiusPx + 2),
          this.baseX + cos * (badgeRadiusPx + 6),
          this.baseY + sin * (badgeRadiusPx + 6)
        );
      }
    }
  }

  /**
   * The looped-feed badge, the one the player most needs to read at a glance.
   * Four static viewfinder corners say "this feed is being played back", and a
   * dashed ring turns once every CAMERAS.art.loopSpinMs to say it is still
   * running. Rotation only: nothing flashes, nothing changes size, and the turn
   * is slow on purpose (Accessibility in GAME_DESIGN.md).
   */
  private drawLoopedBadge(now: number): void {
    const badge = this.indicator;
    const { badgeRadiusPx, badgeLineWidthPx, loopSpinMs, loopDashCount } = CAMERAS.art;
    const colour = DISPLAY_TINT.looped;
    const box = badgeRadiusPx + 2;
    const arm = 5;

    badge.lineStyle(badgeLineWidthPx, colour, 0.95);
    for (const [signX, signY] of CORNER_SIGNS) {
      const cornerX = this.baseX + signX * box;
      const cornerY = this.baseY + signY * box;
      badge.lineBetween(cornerX, cornerY, cornerX - signX * arm, cornerY);
      badge.lineBetween(cornerX, cornerY, cornerX, cornerY - signY * arm);
    }

    const spin = ((now % loopSpinMs) / loopSpinMs) * Math.PI * 2;
    const step = (Math.PI * 2) / loopDashCount;
    badge.lineStyle(badgeLineWidthPx, colour, 0.75);
    for (let i = 0; i < loopDashCount; i += 1) {
      const from = spin + i * step;
      badge.beginPath();
      badge.arc(this.baseX, this.baseY, badgeRadiusPx, from, from + step * 0.5, false);
      badge.strokePath();
    }
  }
}

/** Default cone range in pixels, used when a CameraDef has no rangeTiles override. */
export const DEFAULT_CAMERA_RANGE_PX = CONE_RANGE_PX;

/** Default field of view in degrees, used when a CameraDef has no fovDegrees override. */
export const DEFAULT_CAMERA_FOV_DEGREES = DETECTION.cone.fovDegrees;
