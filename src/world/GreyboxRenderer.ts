import Phaser from 'phaser';
import { FALLBACK_TINT, GRID_TINT, WALL_TINT, ZONE_TINTS } from '../config/zones';
import type { BuildingMap } from './BuildingMap';

/** Spacing of the reference grid, matching the map's tile size. */
const GRID_STEP = 32;

/**
 * Draws the whole building as flat greybox: each zone a distinct floor tint,
 * walls a lighter neutral on top, and a 32px reference grid for readability.
 * This is throwaway debug art, swapped for real tiles in a later phase.
 *
 * Depths are set explicitly so the layers stack correctly and the player (drawn
 * elsewhere at depth 40) always sits above the floor.
 */
export class GreyboxRenderer {
  constructor(scene: Phaser.Scene, map: BuildingMap) {
    this.drawFloors(scene, map);
    this.drawWalls(scene, map);
    this.drawGrid(scene, map);
  }

  private drawFloors(scene: Phaser.Scene, map: BuildingMap): void {
    const g = scene.add.graphics().setDepth(0);
    for (const zone of map.zones) {
      const tint = ZONE_TINTS[zone.name] ?? FALLBACK_TINT;
      g.fillStyle(tint, 1);
      g.fillRect(zone.x, zone.y, zone.width, zone.height);
    }
  }

  private drawWalls(scene: Phaser.Scene, map: BuildingMap): void {
    const g = scene.add.graphics().setDepth(10);
    g.fillStyle(WALL_TINT, 1);
    for (const wall of map.walls) {
      g.fillRect(wall.x, wall.y, wall.width, wall.height);
    }
  }

  private drawGrid(scene: Phaser.Scene, map: BuildingMap): void {
    const g = scene.add.graphics().setDepth(20);
    g.lineStyle(1, GRID_TINT, 0.5);
    for (let x = 0; x <= map.widthInPixels; x += GRID_STEP) {
      g.lineBetween(x, 0, x, map.heightInPixels);
    }
    for (let y = 0; y <= map.heightInPixels; y += GRID_STEP) {
      g.lineBetween(0, y, map.widthInPixels, y);
    }
  }
}
