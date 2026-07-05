import Phaser from 'phaser';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import type { WallRect } from '../world/BuildingMap';

/** How the cone outline is drawn, so guard state never reads by colour alone. */
export type ConeEdge = 'solid' | 'dashed' | 'pulsing';

/** Nearest distance a ray travels from (ox,oy) along unit (dx,dy) before a segment, or Infinity. */
function rayToSegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) {
    return Infinity; // parallel
  }
  const t = ((ax - ox) * sy - (ay - oy) * sx) / denom; // distance along the ray
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom; // position along the segment
  if (t >= 0 && u >= 0 && u <= 1) {
    return t;
  }
  return Infinity;
}

/**
 * A guard's vision cone: 7 tiles range and a 70 degree field of view, fully
 * blocked by walls. It does two jobs, geometry and drawing:
 *  - canSee() answers whether a point is visible, honouring range, angle and
 *    wall occlusion (a wall between guard and target hides the target),
 *  - render() draws the cone as a fan of rays clipped at the walls, so the light
 *    visibly stops at a wall, coloured and edge-styled by the guard's state.
 */
export class VisionCone {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly walls: Phaser.Geom.Rectangle[];
  private readonly range = CONE_RANGE_PX;
  private readonly halfFov = Phaser.Math.DegToRad(DETECTION.cone.fovDegrees) / 2;

  constructor(scene: Phaser.Scene, walls: WallRect[]) {
    this.walls = walls.map((w) => new Phaser.Geom.Rectangle(w.x, w.y, w.width, w.height));
    this.gfx = scene.add.graphics().setDepth(22);
  }

  /** True if (tx,ty) is inside the cone and not hidden behind a wall. */
  canSee(gx: number, gy: number, facing: number, tx: number, ty: number): boolean {
    const dx = tx - gx;
    const dy = ty - gy;
    const dist = Math.hypot(dx, dy);
    if (dist > this.range || dist < 1) {
      return dist < 1; // on top of the guard counts as seen
    }
    const diff = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - facing);
    if (Math.abs(diff) > this.halfFov) {
      return false;
    }
    // Occlusion: any wall crossing the guard-to-target segment blocks the view.
    const line = new Phaser.Geom.Line(gx, gy, tx, ty);
    for (const wall of this.walls) {
      if (Phaser.Geom.Intersects.LineToRectangle(line, wall)) {
        return false;
      }
    }
    return true;
  }

  /** Distance from (ox,oy) along unit (dx,dy) to the nearest wall, capped at range. */
  private rayDistance(ox: number, oy: number, dx: number, dy: number): number {
    let nearest = this.range;
    for (const w of this.walls) {
      const right = w.x + w.width;
      const bottom = w.y + w.height;
      const edges: [number, number, number, number][] = [
        [w.x, w.y, right, w.y],
        [right, w.y, right, bottom],
        [right, bottom, w.x, bottom],
        [w.x, bottom, w.x, w.y],
      ];
      for (const [ax, ay, bx, by] of edges) {
        const t = rayToSegment(ox, oy, dx, dy, ax, ay, bx, by);
        if (t < nearest) {
          nearest = t;
        }
      }
    }
    return nearest;
  }

  /**
   * Draws the cone. The fan of ray endpoints is clipped at walls so the cone
   * stops where the guard's sight does.
   */
  render(
    gx: number,
    gy: number,
    facing: number,
    colour: number,
    edge: ConeEdge,
    timeMs: number
  ): void {
    this.gfx.clear();

    const rays = DETECTION.cone.renderRays;
    const points: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(gx, gy)];
    for (let i = 0; i < rays; i++) {
      const a = facing - this.halfFov + (this.halfFov * 2 * i) / (rays - 1);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const dist = this.rayDistance(gx, gy, dx, dy);
      points.push(new Phaser.Math.Vector2(gx + dx * dist, gy + dy * dist));
    }

    // Fill.
    this.gfx.fillStyle(colour, 0.16);
    this.gfx.fillPoints(points, true);

    // Edge, styled per state so colour is never the only signal.
    const arc = points.slice(1);
    if (edge === 'solid') {
      this.gfx.lineStyle(2, colour, 0.85);
      this.strokeArc(arc);
    } else if (edge === 'dashed') {
      this.gfx.lineStyle(2, colour, 0.9);
      for (let i = 0; i + 1 < arc.length; i += 2) {
        this.gfx.lineBetween(arc[i].x, arc[i].y, arc[i + 1].x, arc[i + 1].y);
      }
    } else {
      // pulsing: solid outline whose alpha and width breathe over time.
      const pulse = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(timeMs / 120));
      this.gfx.lineStyle(3, colour, pulse);
      this.strokeArc(arc);
    }
  }

  private strokeArc(arc: Phaser.Math.Vector2[]): void {
    for (let i = 0; i + 1 < arc.length; i++) {
      this.gfx.lineBetween(arc[i].x, arc[i].y, arc[i + 1].x, arc[i + 1].y);
    }
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
  }
}
