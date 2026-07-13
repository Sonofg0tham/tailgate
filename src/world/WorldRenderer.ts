import Phaser from 'phaser';
import {
  DECORATION_TREATMENTS,
  FLOOR_FALLBACK,
  FLOOR_TEXTURES,
  RENDER,
} from '../config/tiles';
import { FONTS, PALETTE } from '../config/palette';
import { getVenueVisualProfile, type VenueVisualProfile } from '../config/venueVisualProfiles';
import { FALLBACK_TINT, GRID_TINT, ZONE_TINT_ALPHA, ZONE_TINTS } from '../config/zones';
import type { BuildingMap } from './BuildingMap';
import { selectKnownDecorations, type DecorationPoint } from './mapPresentation';

/** Spacing of the reference grid, matching the map's tile size. */
const GRID_STEP = 32;

/**
 * Draws each venue from credited tiles: circulation routes and zones use tiled
 * materials, walls use the venue profile, and furniture comes from map data.
 * The 32px reference grid is kept as a debug overlay, hidden by default and
 * toggled with toggleGrid().
 *
 * Depth order: route -5, floor 0, wash 1, light pools 2, route cues 3, decals
 * 4, walls 9-11, props 14-15, grid 20. The player (depth 40) stays above the
 * world.
 */
export class WorldRenderer {
  private readonly grid: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, map: BuildingMap, levelId: string) {
    const profile = getVenueVisualProfile(levelId);
    this.drawRouteSurface(scene, map, profile);
    this.drawFloors(scene, map);
    this.drawLightPools(scene, map, profile);
    this.drawCirculationCues(scene, map, profile);
    this.drawDecals(scene, map);
    this.drawWalls(scene, map, profile);
    this.drawProps(scene, map, profile);
    this.grid = this.drawGrid(scene, map);
  }

  /** Show or hide the reference grid. Returns the new visibility. */
  toggleGrid(): boolean {
    this.grid.setVisible(!this.grid.visible);
    return this.grid.visible;
  }

  private drawRouteSurface(
    scene: Phaser.Scene,
    map: BuildingMap,
    profile: VenueVisualProfile
  ): void {
    const route = scene.add.tileSprite(
      map.widthInPixels / 2,
      map.heightInPixels / 2,
      map.widthInPixels,
      map.heightInPixels,
      profile.routeSurface.textureKey
    );
    route.setTileScale(profile.routeSurface.textureScale, profile.routeSurface.textureScale);
    route.setTint(profile.routeSurface.colour);
    route.setAlpha(profile.routeSurface.alpha);
    route.setDepth(-5);
  }

  private drawCirculationCues(
    scene: Phaser.Scene,
    map: BuildingMap,
    profile: VenueVisualProfile
  ): void {
    const cues = scene.add.graphics().setDepth(3);
    cues.lineStyle(1, profile.routeSurface.edge.colour, profile.routeSurface.edge.alpha);
    for (const zone of map.zones) {
      cues.strokeRect(zone.x + 0.5, zone.y + 0.5, zone.width - 1, zone.height - 1);
    }

    cues.lineStyle(
      2,
      profile.routeSurface.threshold.colour,
      profile.routeSurface.threshold.alpha
    );
    for (const door of map.doors) {
      if (door.width >= door.height) {
        const y = door.y + door.height / 2;
        cues.lineBetween(door.x + 3, y, door.x + door.width - 3, y);
      } else {
        const x = door.x + door.width / 2;
        cues.lineBetween(x, door.y + 3, x, door.y + door.height - 3);
      }
    }
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

  private drawLightPools(
    scene: Phaser.Scene,
    map: BuildingMap,
    profile: VenueVisualProfile
  ): void {
    for (const light of map.lights) {
      const treatment = profile.lightPools[light.kind] ?? profile.lightPools.pool;
      if (!treatment) {
        continue;
      }
      scene.add
        .ellipse(
          light.x + light.width / 2,
          light.y + light.height / 2,
          Math.max(24, light.width),
          Math.max(24, light.height),
          treatment.colour,
          treatment.alpha
        )
        .setDepth(2);
    }
  }

  private drawDecals(scene: Phaser.Scene, map: BuildingMap): void {
    const decals = selectKnownDecorations(
      map.decals,
      (key) => scene.textures.exists(key),
      'decal'
    );
    for (const decal of decals) {
      this.addDecorationSprite(scene, decal, 4);
    }
  }

  private drawWalls(scene: Phaser.Scene, map: BuildingMap, profile: VenueVisualProfile): void {
    const shadows = scene.add.graphics().setDepth(9);
    const edges = scene.add.graphics().setDepth(11);
    shadows.fillStyle(profile.wall.shadow.colour, profile.wall.shadow.alpha);
    edges.fillStyle(profile.wall.edge.colour, profile.wall.edge.alpha);

    for (const wall of map.walls) {
      const cx = wall.x + wall.width / 2;
      const cy = wall.y + wall.height / 2;
      shadows.fillRect(
        wall.x + profile.wall.shadow.offsetX,
        wall.y + profile.wall.shadow.offsetY,
        wall.width,
        wall.height
      );
      const wallSurface = scene.add.tileSprite(
        cx,
        cy,
        wall.width,
        wall.height,
        profile.wall.defaultTextureKey
      );
      wallSurface.setTileScale(profile.wall.textureScale, profile.wall.textureScale);
      wallSurface.setDepth(10);
      edges.fillRect(wall.x, wall.y, wall.width, Math.min(2, wall.height));
      edges.fillRect(wall.x, wall.y, Math.min(2, wall.width), wall.height);
    }
  }

  private drawProps(scene: Phaser.Scene, map: BuildingMap, profile: VenueVisualProfile): void {
    const props = selectKnownDecorations(
      map.props,
      (key) => scene.textures.exists(key),
      'prop'
    );
    for (const prop of props) {
      scene.add
        .sprite(
          prop.x + profile.propShadow.offsetX,
          prop.y + profile.propShadow.offsetY,
          prop.key
        )
        .setScale(RENDER.propScale * prop.scale)
        .setAngle(prop.rotation)
        .setTint(profile.propShadow.colour)
        .setAlpha(profile.propShadow.alpha * prop.alpha)
        .setDepth(14);
      this.addDecorationSprite(scene, prop, 15);
    }
  }

  private addDecorationSprite(
    scene: Phaser.Scene,
    decoration: DecorationPoint,
    depth: number
  ): void {
    const treatment = DECORATION_TREATMENTS[decoration.key];
    const sprite = scene.add
      .sprite(decoration.x, decoration.y, decoration.key)
      .setScale(RENDER.propScale * decoration.scale)
      .setAngle(decoration.rotation)
      .setAlpha(decoration.alpha * (treatment?.alpha ?? 1))
      .setDepth(depth);
    if (treatment?.tintMode === 'fill') {
      sprite.setTintFill(treatment.colour);
    } else if (treatment) {
      sprite.setTint(treatment.colour);
    }
    if (decoration.label) {
      scene.add
        .text(decoration.x, decoration.y, decoration.label, {
          fontFamily: FONTS.mono,
          fontSize: '11px',
          color: PALETTE.text,
          stroke: PALETTE.base,
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setAngle(decoration.rotation)
        .setAlpha(decoration.alpha)
        .setDepth(depth + 0.1);
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
