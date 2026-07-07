import Phaser from 'phaser';
import { ART } from '../config/art';
import type { EffectPoint, LightRect } from '../world/BuildingMap';

/** Texture key for the shared soft radial dot every particle uses. */
const DOT_KEY = 'softDot';
const DOT_SIZE = 32;

/**
 * Ambient atmosphere, all data-driven and all generated at runtime: dust motes
 * drift in every pool light the map authors, and the map's effects layer
 * places steam (kitchen kettle) and haze (server rack heat). Everything sits
 * below the lighting veil, so darkness dims the air exactly like it dims the
 * floor. No texture files: the soft dot is drawn onto a canvas at boot, which
 * keeps the asset SBOM empty and the licence trivially CC0.
 */
export class AmbientParticles {
  constructor(scene: Phaser.Scene, lights: LightRect[], effects: EffectPoint[]) {
    AmbientParticles.ensureDot(scene);

    for (const light of lights) {
      if (light.kind === 'pool') {
        // Tiled rect origins are top-left; centre the cloud in the lit pool,
        // exactly like LightModel centres the light itself. Point lights
        // (width and height 0) pass through unchanged.
        this.addDust(scene, light.x + light.width / 2, light.y + light.height / 2);
      }
    }
    for (const effect of effects) {
      if (effect.kind === 'steam') {
        this.addSteam(scene, effect.x, effect.y);
      } else if (effect.kind === 'haze') {
        this.addHaze(scene, effect.x, effect.y);
      }
    }
  }

  /** Slow drifting motes inside a pool light's throw. */
  private addDust(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.dust;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spreadX, max: cfg.spreadX },
        y: { min: -cfg.spreadY, max: cfg.spreadY },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftX, max: cfg.driftX },
        speedY: { min: -cfg.riseMax, max: -cfg.riseMin },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Kettle steam: rises, fattens and fades. */
  private addSteam(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.steam;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spawnSpreadX, max: cfg.spawnSpreadX },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftX, max: cfg.driftX },
        speedY: { min: -cfg.riseMax, max: -cfg.riseMin },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Server room heat haze: broad, slow, sideways wisps. */
  private addHaze(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.haze;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spawnSpreadX, max: cfg.spawnSpreadX },
        y: { min: -cfg.spawnSpreadY, max: cfg.spawnSpreadY },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftPx, max: cfg.driftPx },
        speedY: { min: -cfg.driftY, max: cfg.driftY },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Builds the shared soft radial dot texture once (guarded for restarts). */
  private static ensureDot(scene: Phaser.Scene): void {
    if (scene.textures.exists(DOT_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(DOT_KEY, DOT_SIZE, DOT_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const r = DOT_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, DOT_SIZE, DOT_SIZE);
    tex.refresh();
  }
}
