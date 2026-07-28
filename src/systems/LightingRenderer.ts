import Phaser from 'phaser';
import { CONE_RANGE_PX } from '../config/detection';
import { FEED } from '../config/feed';
import { LIGHTING } from '../config/lighting';
import { PALETTE_HEX } from '../config/palette';
import { getSettings } from '../state/settings';
import type { Guard } from '../entities/Guard';
import type { Player } from '../entities/Player';
import type { LightSource } from './LightModel';

/** Size of the soft radial light-mask texture used as an erase brush. */
const MASK_SIZE = 256;
const MASK_KEY = 'lightMask';

/**
 * The visual side of lighting. A screen-fixed RenderTexture is filled with a
 * dark veil each frame, then soft radial lights are ERASED out of it, punching
 * holes where the world shows through: room pools, a harsh loading-dock flood,
 * tight server rack LEDs, plus a soft aura that always follows the player so the
 * character and nearby walls are never lost (the accessibility floor).
 *
 * The veil sits at depth 25, above the world and cones-are-lifted-above-it, so
 * floors, walls and props dim in the dark while the player, guard, vision cones
 * and HUD stay fully readable. Detection light is computed separately in
 * LightModel; this renderer is purely what the human sees, which is why the
 * static lights can breathe here without touching what a guard can spot.
 */
export class LightingRenderer {
  private readonly scene: Phaser.Scene;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    LightingRenderer.ensureMask(scene);

    this.rt = scene.add
      .renderTexture(0, 0, scene.scale.width, scene.scale.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);

    // A free brush (not on the display list), reused for every erased light.
    this.brush = scene.make.image({ x: 0, y: 0, key: MASK_KEY, add: false }).setOrigin(0.5);
  }

  /** Redraws the veil and erases the current lights. Called last each frame. */
  update(
    cam: Phaser.Cameras.Scene2D.Camera,
    player: Player,
    guard: Guard | undefined,
    sources: readonly LightSource[]
  ): void {
    const settings = getSettings();
    const veil = Phaser.Math.Clamp(
      1 - LIGHTING.visibilityFloorGlobal - settings.extraBrightness,
      0,
      1
    );
    this.rt.clear();
    this.rt.fill(PALETTE_HEX.base, veil);

    const ox = cam.worldView.x;
    const oy = cam.worldView.y;
    const nowMs = this.scene.time.now;

    for (const s of sources) {
      // The breathe is atmosphere, so it rides on the screen-effects setting.
      // The source's own intensity is never written to: LightModel hands out a
      // readonly list and detection must keep seeing the authored numbers.
      const intensity = settings.screenEffects
        ? s.intensity * this.breatheFactor(s, nowMs)
        : s.intensity;
      this.eraseLight(s.x - ox, s.y - oy, s.radiusPx, intensity);
    }

    // The guard's own sightline glows softly, so its cone reads as a torch beam.
    if (guard) {
      this.eraseLight(guard.x - ox, guard.y - oy, CONE_RANGE_PX * 0.6, LIGHTING.guardTorchIntensity * 0.7);
    }

    // The player is always lit. Render only, never fed to detection.
    this.eraseLight(
      player.x - ox,
      player.y - oy,
      LIGHTING.playerAuraRadiusPx,
      LIGHTING.playerAuraStrength
    );
  }

  setVisible(visible: boolean): void {
    this.rt.setVisible(visible);
  }

  /** The screen-fixed veil texture, so secondary feed cameras can ignore it. */
  get veil(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }

  /**
   * Presentation-only breathe on one static light: a slow, tiny swell in
   * brightness whose phase and period come from where the light sits, so no two
   * lights in the building are ever in step and the place reads as occupied
   * rather than animated. Room pools and the dock flood share one set of
   * numbers, server rack LEDs get their own slightly quicker shimmer. Both are
   * far too slow and far too small to register as a flicker.
   */
  private breatheFactor(s: LightSource, nowMs: number): number {
    const cfg = s.kind === 'rack' ? FEED.lights.rack : FEED.lights.pool;
    // A stable 0..1 spread from the light's position: the same light always
    // breathes the same way, across a detain restart as well as across frames.
    const seed = s.x * 0.0137 + s.y * 0.0219;
    const spread = seed - Math.floor(seed);
    const periodMs = cfg.minPeriodMs + spread * (cfg.maxPeriodMs - cfg.minPeriodMs);
    return 1 + cfg.amplitude * Math.sin((nowMs / periodMs) * Math.PI * 2 + seed);
  }

  private eraseLight(sx: number, sy: number, radiusPx: number, intensity: number): void {
    this.brush.setScale((radiusPx * 2) / MASK_SIZE);
    this.brush.setAlpha(Phaser.Math.Clamp(intensity, 0, 1));
    this.rt.erase(this.brush, sx, sy);
  }

  /** Builds the soft radial gradient brush texture once (guarded for restart). */
  private static ensureMask(scene: Phaser.Scene): void {
    if (scene.textures.exists(MASK_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(MASK_KEY, MASK_SIZE, MASK_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const r = MASK_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. This generated
    // gradient is the exception, its soft falloff must stay smoothly filtered.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
