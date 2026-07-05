import Phaser from 'phaser';
import { FLOOR_FALLBACK, FLOOR_TEXTURES, RENDER, WALL_TEXTURE } from '../config/tiles';
import { FALLBACK_TINT, GRID_TINT, ZONE_TINT_ALPHA, ZONE_TINTS } from '../config/zones';
import type { BuildingMap } from './BuildingMap';

/** Spacing of the reference grid, matching the map's tile size. */
const GRID_STEP = 32;

/**
 * Draws the building from Kenney CC0 tiles: each zone floored with a texture and
 * washed with a subtle room colour, walls tiled with brick, and furniture props
 * placed from the map's props layer. The 32px reference grid is kept as a debug
 * overlay, hidden by default and toggled with toggleGrid().
 *
 * Depth order: floor 0, zone wash 1, walls 10, props 15, grid 20. The player
 * (drawn elsewhere at depth 40) and the noise ring (30) sit above all of this.
 */
export class WorldRenderer {
  private readonly grid: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, map: BuildingMap) {
    this.drawFloors(scene, map);
    this.drawWalls(scene, map);
    this.drawProps(scene, map);
    this.grid = this.drawGrid(scene, map);
  }

  /** Show or hide the reference grid. Returns the new visibility. */
  toggleGrid(): boolean {
    this.grid.setVisible(!this.grid.visible);
    return this.grid.visible;
  }

  private drawFloors(scene: Phaser.Scene, map: BuildingMap): void {
    for (const zone of map.zones) {
      const texture = FLOOR_TEXTURES[zone.name] ?? FLOOR_FALLBACK;
      const cx = zone.x + zone.width / 2;
      const cy = zone.y + zone.height / 2;

      const floor = scene.add.tileSprite(cx, cy, zone.width, zone.height, texture);
      floor.setTileScale(RENDER.tileScale, RENDER.tileScale);
      floor.setDepth(0);

      // Subtle colour wash so each room still reads at a glance.
      const tint = ZONE_TINTS[zone.name] ?? FALLBACK_TINT;
      scene.add
        .rectangle(cx, cy, zone.width, zone.height, tint, ZONE_TINT_ALPHA)
        .setDepth(1);
    }
  }

  private drawWalls(scene: Phaser.Scene, map: BuildingMap): void {
    for (const wall of map.walls) {
      const cx = wall.x + wall.width / 2;
      const cy = wall.y + wall.height / 2;
      const brick = scene.add.tileSprite(cx, cy, wall.width, wall.height, WALL_TEXTURE);
      brick.setTileScale(RENDER.tileScale, RENDER.tileScale);
      brick.setDepth(10);
    }
  }

  private drawProps(scene: Phaser.Scene, map: BuildingMap): void {
    for (const prop of map.props) {
      if (!scene.textures.exists(prop.key)) {
        // A prop naming a texture we did not load is a data bug, skip it loudly.
        console.warn(`Unknown prop texture "${prop.key}" at ${prop.x},${prop.y}`);
        continue;
      }
      scene.add.sprite(prop.x, prop.y, prop.key).setScale(RENDER.propScale).setDepth(15);
    }
  }

  private drawGrid(scene: Phaser.Scene, map: BuildingMap): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics().setDepth(20);
    g.lineStyle(1, GRID_TINT, 0.5);
    for (let x = 0; x <= map.widthInPixels; x += GRID_STEP) {
      g.lineBetween(x, 0, x, map.heightInPixels);
    }
    for (let y = 0; y <= map.heightInPixels; y += GRID_STEP) {
      g.lineBetween(0, y, map.widthInPixels, y);
    }
    g.setVisible(false);
    return g;
  }
}
