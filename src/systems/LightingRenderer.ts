import Phaser from 'phaser';
import { CONE_RANGE_PX } from '../config/detection';
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
 * LightModel; this renderer is purely what the human sees.
 */
export class LightingRenderer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
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
    const veil = Phaser.Math.Clamp(
      1 - LIGHTING.visibilityFloorGlobal - getSettings().extraBrightness,
      0,
      1
    );
    this.rt.clear();
    this.rt.fill(PALETTE_HEX.base, veil);

    const ox = cam.worldView.x;
    const oy = cam.worldView.y;

    for (const s of sources) {
      this.eraseLight(s.x - ox, s.y - oy, s.radiusPx, s.intensity);
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
