import Phaser from 'phaser';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { AMBIENT_FALLBACK, AMBIENT_LIGHT, LIGHTING } from '../config/lighting';
import type { LightRect, ZoneRect } from '../world/BuildingMap';

/** A static light source the renderer draws and the model samples. */
export interface LightSource {
  kind: 'pool' | 'flood' | 'rack';
  x: number;
  y: number;
  radiusPx: number;
  intensity: number;
}

const GUARD_HALF_FOV = Phaser.Math.DegToRad(DETECTION.cone.fovDegrees) / 2;

/**
 * The gameplay side of lighting: a pure analytic sampler of how lit a world
 * point is, 0 (dark) to 1 (bright). It is the "darkness as cover" model. The
 * scene samples it at the player each frame and passes the value into the guard,
 * which fills suspicion slower in the dark.
 *
 * It deliberately does NOT include the player's readability aura, so a player
 * standing in pitch dark still reads as concealed to guards while staying
 * visible to the human on screen. That separation is the whole point.
 */
export class LightModel {
  private readonly zones: ZoneRect[];
  private readonly staticSources: LightSource[];
  private torch: { x: number; y: number; facing: number } | null = null;

  constructor(zones: ZoneRect[], lights: LightRect[]) {
    this.zones = zones;
    this.staticSources = lights.map((l) => this.toSource(l));
  }

  get sources(): readonly LightSource[] {
    return this.staticSources;
  }

  setGuardTorch(x: number, y: number, facing: number): void {
    this.torch = { x, y, facing };
  }

  clearGuardTorch(): void {
    this.torch = null;
  }

  /** Analytic light 0..1 at a point: the max of ambient, pools and the guard torch. */
  computeLightAt(x: number, y: number): number {
    let light = this.zoneAmbientAt(x, y);

    for (const s of this.staticSources) {
      const dist = Math.hypot(x - s.x, y - s.y);
      if (dist < s.radiusPx) {
        const falloff = 1 - dist / s.radiusPx;
        light = Math.max(light, s.intensity * falloff);
      }
    }

    if (this.torch) {
      const dx = x - this.torch.x;
      const dy = y - this.torch.y;
      const dist = Math.hypot(dx, dy);
      if (dist < CONE_RANGE_PX && dist > 1) {
        const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - this.torch.facing));
        if (diff <= GUARD_HALF_FOV) {
          const falloff = 1 - dist / CONE_RANGE_PX;
          light = Math.max(light, LIGHTING.guardTorchIntensity * falloff);
        }
      }
    }

    return Phaser.Math.Clamp(light, 0, 1);
  }

  private zoneAmbientAt(x: number, y: number): number {
    // Last match wins, mirroring render order (interior rooms over the car park).
    let ambient = AMBIENT_FALLBACK;
    for (const z of this.zones) {
      if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
        ambient = AMBIENT_LIGHT[z.name] ?? AMBIENT_FALLBACK;
      }
    }
    return ambient;
  }

  private toSource(l: LightRect): LightSource {
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const kind: LightSource['kind'] =
      l.kind === 'flood' ? 'flood' : l.kind === 'rack' ? 'rack' : 'pool';
    const cfg = LIGHTING[kind];
    // A pool's reach is the larger of the configured radius and its own footprint.
    const radiusPx = Math.max(cfg.radiusPx, Math.max(l.width, l.height) / 2);
    return { kind, x: cx, y: cy, radiusPx, intensity: cfg.intensity };
  }
}
