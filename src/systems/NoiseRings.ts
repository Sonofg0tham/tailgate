import Phaser from 'phaser';
import { READABILITY } from '../config/readability';
import { NOISE_RING_TINT } from '../config/zones';

/** One expanding, fading ring at a footstep. */
interface Ring {
  x: number;
  y: number;
  bornAt: number;
}

/**
 * The visual ear: faint rings that expand and fade where guard footsteps
 * land, within hearing range of the player. The occluded footstep audio
 * already carries this information for hearing players; the rings carry the
 * same information for everyone else, which is the same reason the vision
 * cones pair colour with an edge style. Deliberately small, slow and low
 * contrast, they whisper, matching the audio they mirror.
 */
export class NoiseRings {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];

  constructor(scene: Phaser.Scene) {
    // Just under the player (40) and above the lighting veil (25): audible
    // things are "visible" here even in darkness, exactly like the audio.
    this.gfx = scene.add.graphics().setDepth(29);
  }

  /** The graphics object, so CCTV feed cameras can ignore it: a camera
   * cannot hear, so the sound rings do not belong on its picture. */
  get gameObject(): Phaser.GameObjects.Graphics {
    return this.gfx;
  }

  /** Starts one ring at a footfall. The caller decides range and cadence. */
  spawn(x: number, y: number, now: number): void {
    this.rings.push({ x, y, bornAt: now });
  }

  /** Advances and redraws every live ring; expired rings are dropped. */
  update(now: number): void {
    const { ringLifeMs, startRadiusPx, endRadiusPx } = READABILITY.noiseRings;
    this.gfx.clear();
    this.rings = this.rings.filter((ring) => now - ring.bornAt < ringLifeMs);
    for (const ring of this.rings) {
      const t = (now - ring.bornAt) / ringLifeMs;
      const radius = Phaser.Math.Linear(startRadiusPx, endRadiusPx, t);
      this.gfx.lineStyle(1.5, NOISE_RING_TINT, (1 - t) * 0.45);
      this.gfx.strokeCircle(ring.x, ring.y, radius);
    }
  }
}
