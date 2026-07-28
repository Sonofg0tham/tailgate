import Phaser from 'phaser';
import { FEED } from '../config/feed';
import { getSettings } from '../state/settings';

/** Texture keys for the two generated sheets, built once and reused. */
const VIGNETTE_KEY = 'feedVignette';
const VIGNETTE_SIZE = 256;
const NOISE_KEY = 'feedNoise';

const TAU = Math.PI * 2;

/**
 * The security-feed treatment: the quiet suggestion that the player is watching
 * this job on the building's own cameras rather than through a window. Three
 * screen-fixed sheets sit above the world and the lighting veil and below every
 * HUD readout: a barely-there cool cast, faint stepped static, and a soft
 * corner vignette that carries the building's alert level as colour.
 *
 * It is the multiplexer's visual language turned right down. No scanlines and
 * no roll bar: those stay exclusive to the hijack feed, where the player is
 * genuinely looking at a monitor. Everything here is slow, small and generated
 * at runtime, so no asset ships with it.
 *
 * Alert language, all on the vignette: calm is a near-black edge, cautious
 * warms it towards clearance amber, lockdown deepens it and takes a slow red
 * edge with a gentle swell. Red is allowed here because it means exactly what
 * it means everywhere else in Tailgate: the player is in trouble.
 *
 * The whole thing is off when the screen-effects setting is off, including the
 * alert tinting. The DETAINED flash and the alarm shake are separate, and stay
 * governed by the screen-shake setting.
 */
export class FeedTreatment {
  private readonly cast: Phaser.GameObjects.Rectangle;
  private readonly grain: Phaser.GameObjects.TileSprite;
  private readonly vignette: Phaser.GameObjects.Image;
  /** The three sheets as one list, so feed cameras can ignore them wholesale. */
  private readonly sheets: (
    | Phaser.GameObjects.Rectangle
    | Phaser.GameObjects.TileSprite
    | Phaser.GameObjects.Image
  )[];

  /** Scene-clock ts of the next static pattern jump. */
  private nextGrainStepAt = 0;
  /** Eased vignette colour, held per channel so no colour object is allocated. */
  private tintR: number;
  private tintG: number;
  private tintB: number;
  /** The tint currently applied, so setTint only fires when it actually changes. */
  private appliedTint = -1;
  /** Eased vignette opacity, before the lockdown swell is added. */
  private alpha = FEED.vignette.calmAlpha;
  /** How far into lockdown the treatment has eased, 0 to 1. Gates the swell. */
  private lockdownMix = 0;
  /** Whether the sheets are currently shown, so visibility is set only on change. */
  private shown = true;

  constructor(scene: Phaser.Scene) {
    FeedTreatment.ensureTextures(scene);

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Explicit fractional depths keep the stack honest regardless of the order
    // the scene happens to build things in: cast, then static, then vignette.
    this.cast = scene.add
      .rectangle(w / 2, h / 2, w, h, FEED.cast.colour, FEED.cast.alpha)
      .setScrollFactor(0)
      .setDepth(FEED.depth);
    this.grain = scene.add
      .tileSprite(w / 2, h / 2, w, h, NOISE_KEY)
      .setScrollFactor(0)
      .setDepth(FEED.depth + 0.1)
      .setAlpha(FEED.grain.alpha);
    this.vignette = scene.add
      .image(w / 2, h / 2, VIGNETTE_KEY)
      .setDisplaySize(w, h)
      .setScrollFactor(0)
      .setDepth(FEED.depth + 0.2)
      .setAlpha(FEED.vignette.calmAlpha);

    const calm = FEED.vignette.calmTint;
    this.tintR = (calm >> 16) & 0xff;
    this.tintG = (calm >> 8) & 0xff;
    this.tintB = calm & 0xff;
    this.applyTint();

    this.sheets = [this.cast, this.grain, this.vignette];
  }

  /**
   * The screen-fixed sheets, so a CCTV feed camera can ignore them: the
   * multiplexer draws its own, stronger treatment over that picture and must
   * not get this one on top of it.
   */
  get screenObjects(): readonly Phaser.GameObjects.GameObject[] {
    return this.sheets;
  }

  /**
   * Advances the treatment one frame. Pass the scene clock, the frame delta and
   * the building's current alert level (0 calm, 1 cautious, 2 lockdown); the
   * level is read every frame rather than pushed, so a camera-driven alert on a
   * guardless level lands exactly like a radioed one.
   */
  update(nowMs: number, dtMs: number, alertLevel: number): void {
    if (!getSettings().screenEffects) {
      this.setShown(false);
      return;
    }
    this.setShown(true);

    // The static pattern jumps a few times a second, deliberately not every
    // frame: analogue shimmer without a strobing flicker. Same rule as the
    // multiplexer feed, just fainter.
    if (nowMs >= this.nextGrainStepAt) {
      this.nextGrainStepAt = nowMs + FEED.grain.stepMs;
      this.grain.setTilePosition(
        Math.random() * FEED.grain.tilePx,
        Math.random() * FEED.grain.tilePx
      );
    }

    const cfg = FEED.vignette;
    const level = alertLevel >= 2 ? 2 : alertLevel >= 1 ? 1 : 0;
    const targetTint =
      level === 2 ? cfg.lockdownTint : level === 1 ? cfg.cautiousTint : cfg.calmTint;
    const targetAlpha =
      level === 2 ? cfg.lockdownAlpha : level === 1 ? cfg.cautiousAlpha : cfg.calmAlpha;

    // Exponential ease, so the settle time is the same whatever the frame rate.
    // One third of easeMs as the time constant puts it ~95% of the way there by
    // easeMs, which is the "eases back over about a second" feel.
    const k = 1 - Math.exp(-dtMs / (cfg.easeMs / 3));
    this.tintR += (((targetTint >> 16) & 0xff) - this.tintR) * k;
    this.tintG += (((targetTint >> 8) & 0xff) - this.tintG) * k;
    this.tintB += ((targetTint & 0xff) - this.tintB) * k;
    this.alpha += (targetAlpha - this.alpha) * k;
    this.lockdownMix += ((level === 2 ? 1 : 0) - this.lockdownMix) * k;
    this.applyTint();

    // The lockdown swell, faded in with the tint so it never arrives as a jolt.
    const pulse =
      this.lockdownMix * cfg.pulseAlpha * Math.sin((nowMs / cfg.pulsePeriodMs) * TAU);
    this.vignette.setAlpha(Phaser.Math.Clamp(this.alpha + pulse, 0, 1));
  }

  /** Removes every sheet. Called on scene shutdown, before a restart rebuilds them. */
  destroy(): void {
    for (const sheet of this.sheets) {
      sheet.destroy();
    }
  }

  private setShown(shown: boolean): void {
    if (shown === this.shown) {
      return;
    }
    this.shown = shown;
    for (const sheet of this.sheets) {
      sheet.setVisible(shown);
    }
  }

  /** Packs the eased channels and tints the vignette, only when it has moved. */
  private applyTint(): void {
    const packed =
      (Math.round(this.tintR) << 16) | (Math.round(this.tintG) << 8) | Math.round(this.tintB);
    if (packed === this.appliedTint) {
      return;
    }
    this.appliedTint = packed;
    this.vignette.setTint(packed);
  }

  /**
   * Builds the two generated sheets once (guarded, because a detain restarts
   * the scene). The vignette is a white radial falloff so a single tint can
   * recolour it; the static is the same random-grey tile the multiplexer uses.
   */
  private static ensureTextures(scene: Phaser.Scene): void {
    FeedTreatment.ensureVignette(scene);
    FeedTreatment.ensureNoise(scene);
  }

  private static ensureVignette(scene: Phaser.Scene): void {
    if (scene.textures.exists(VIGNETTE_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(VIGNETTE_KEY, VIGNETTE_SIZE, VIGNETTE_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const r = VIGNETTE_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    // Nothing at all across the middle of the screen, then a long soft ramp.
    // Stretched to 16:9 the ramp becomes an ellipse, so the corners sit past
    // its last stop and carry the most weight: a corner vignette, not a frame.
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.82, 'rgba(255,255,255,0.38)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIGNETTE_SIZE, VIGNETTE_SIZE);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. This generated
    // gradient is an exception, like the lighting mask: its falloff must stay
    // smooth when it is stretched over the whole canvas.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private static ensureNoise(scene: Phaser.Scene): void {
    if (scene.textures.exists(NOISE_KEY)) {
      return;
    }
    const size = FEED.grain.tilePx;
    const tex = scene.textures.createCanvas(NOISE_KEY, size, size);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const shade = Math.floor(Math.random() * 255);
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    tex.refresh();
  }
}
