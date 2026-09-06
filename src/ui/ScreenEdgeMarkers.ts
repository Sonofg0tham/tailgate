import Phaser from 'phaser';
import { HUD } from '../config/hud';
import { PALETTE_HEX } from '../config/palette';
import { READABILITY } from '../config/readability';
import type { Guard } from '../entities/Guard';
import { projectToScreenEdge } from './screenEdge';

/** A world point the border marker should point at. */
export interface EdgeTarget {
  x: number;
  y: number;
}

/**
 * Screen-border markers for things worth knowing about that are out of view:
 * agitated guards (Phase 15's chevrons, now one per guard) and the current
 * objective (Phase 21). A calm patrol draws nothing, scouting still means
 * walking over and looking; the objective diamond only appears while its
 * world marker is off screen, so it never doubles up.
 *
 * Shapes carry the meaning, colour seconds it: a hollow amber outline for a
 * curious guard, two solid red arrowheads for a chasing one, a hollow amber
 * diamond for the objective (the same diamond the world marker uses).
 */
export class ScreenEdgeMarkers {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(998);
  }

  /** The graphics object, so CCTV feed cameras can ignore it. */
  get gameObject(): Phaser.GameObjects.Graphics {
    return this.gfx;
  }

  clear(): void {
    this.gfx.clear();
  }

  update(
    cam: Phaser.Cameras.Scene2D.Camera,
    width: number,
    height: number,
    playerX: number,
    playerY: number,
    guards: readonly Guard[],
    objective: EdgeTarget | null
  ): void {
    this.gfx.clear();
    for (const guard of guards) {
      this.drawGuardChevron(cam, width, height, playerX, playerY, guard);
    }
    if (objective) {
      this.drawObjective(cam, width, height, objective);
    }
  }

  private drawGuardChevron(
    cam: Phaser.Cameras.Scene2D.Camera,
    width: number,
    height: number,
    playerX: number,
    playerY: number,
    guard: Guard
  ): void {
    if (guard.state === 'patrol') {
      return;
    }
    if (Phaser.Math.Distance.Between(playerX, playerY, guard.x, guard.y) > READABILITY.chevron.rangePx) {
      return;
    }
    const { sizePx } = READABILITY.chevron;
    const edge = projectToScreenEdge(
      guard.x - cam.scrollX,
      guard.y - cam.scrollY,
      width,
      height,
      HUD.edgeInsets
    );
    if (edge.onScreen) {
      return; // visible: the guard themself is the warning
    }
    const angle = edge.angle;
    const triangle = (cx: number, cy: number) => {
      const point = (a: number) => ({ x: cx + Math.cos(a) * sizePx, y: cy + Math.sin(a) * sizePx });
      return [point(angle), point(angle + 2.5), point(angle - 2.5)] as const;
    };

    if (guard.state === 'alert') {
      this.gfx.fillStyle(PALETTE_HEX.alarm, 0.95);
      const back = triangle(
        edge.x - Math.cos(angle) * sizePx * 1.4,
        edge.y - Math.sin(angle) * sizePx * 1.4
      );
      const front = triangle(edge.x, edge.y);
      this.gfx.fillTriangle(front[0].x, front[0].y, front[1].x, front[1].y, front[2].x, front[2].y);
      this.gfx.fillTriangle(back[0].x, back[0].y, back[1].x, back[1].y, back[2].x, back[2].y);
    } else {
      const [tip, left, right] = triangle(edge.x, edge.y);
      this.gfx.lineStyle(2, PALETTE_HEX.amber, 0.95);
      this.gfx.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }
  }

  private drawObjective(
    cam: Phaser.Cameras.Scene2D.Camera,
    width: number,
    height: number,
    target: EdgeTarget
  ): void {
    const { sizePx } = HUD.edgeMarker;
    const edge = projectToScreenEdge(
      target.x - cam.scrollX,
      target.y - cam.scrollY,
      width,
      height,
      HUD.edgeInsets
    );
    if (edge.onScreen) {
      return;
    }
    const r = sizePx;
    this.gfx.lineStyle(2, PALETTE_HEX.amber, 0.9);
    this.gfx.beginPath();
    this.gfx.moveTo(edge.x, edge.y - r);
    this.gfx.lineTo(edge.x + r, edge.y);
    this.gfx.lineTo(edge.x, edge.y + r);
    this.gfx.lineTo(edge.x - r, edge.y);
    this.gfx.closePath();
    this.gfx.strokePath();
    // A short tick from the diamond toward the target, so it reads as "that way".
    this.gfx.lineBetween(
      edge.x + Math.cos(edge.angle) * r,
      edge.y + Math.sin(edge.angle) * r,
      edge.x + Math.cos(edge.angle) * (r + 6),
      edge.y + Math.sin(edge.angle) * (r + 6)
    );
  }
}
