import Phaser from 'phaser';
import { READABILITY } from '../config/readability';
import { NOISE_RING_TINT } from '../config/zones';

/** One expanding, fading ring at a footstep or a landed bolt. */
interface Ring {
  x: number;
  y: number;
  bornAt: number;
  /** Radius this ring grows to. Footsteps use the small default from config. */
  endRadiusPx: number;
  /** Lifetime, ms. A wide ring needs longer to read as one travelling sound. */
  lifeMs: number;
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

  /**
   * Starts one ring at a footfall. The caller decides range and cadence.
   *
   * Pass overrides to draw a one-off sound that is not a footstep: a thrown
   * bolt spawns a single wide ring that grows to the distance its noise
   * actually carries, so the player can see how far a throw reaches instead of
   * guessing. Phase 20 playtest: bolts read as doing nothing at all, partly
   * because a throw that landed out of a guard's earshot had no visible result
   * whatsoever.
   */
  spawn(
    x: number,
    y: number,
    now: number,
    overrides?: { endRadiusPx?: number; lifeMs?: number }
  ): void {
    this.rings.push({
      x,
      y,
      bornAt: now,
      endRadiusPx: overrides?.endRadiusPx ?? READABILITY.noiseRings.endRadiusPx,
      lifeMs: overrides?.lifeMs ?? READABILITY.noiseRings.ringLifeMs,
    });
  }

  /** Advances and redraws every live ring; expired rings are dropped. */
  update(now: number): void {
    const { startRadiusPx, strokeWidth, peakAlpha } = READABILITY.noiseRings;
    this.gfx.clear();
    this.rings = this.rings.filter((ring) => now - ring.bornAt < ring.lifeMs);
    for (const ring of this.rings) {
      const t = (now - ring.bornAt) / ring.lifeMs;
      const radius = Phaser.Math.Linear(startRadiusPx, ring.endRadiusPx, t);
      this.gfx.lineStyle(strokeWidth, NOISE_RING_TINT, (1 - t) * peakAlpha);
      this.gfx.strokeCircle(ring.x, ring.y, radius);
    }
  }
}
