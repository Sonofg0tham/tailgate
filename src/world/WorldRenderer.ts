import Phaser from 'phaser';
import {
  CONTACT_SHADOW,
  FLOOR_MATERIAL_KINDS,
  FLOOR_MATERIAL_SPECS,
  MATERIAL_RENDER,
  WALL_EXTRUSION,
  type FloorMaterialKind,
} from '../config/materials';
import {
  DECORATION_TREATMENTS,
  FLOOR_FALLBACK,
  FLOOR_TEXTURES,
  RENDER,
} from '../config/tiles';
import { FONTS, PALETTE } from '../config/palette';
import { getVenueVisualProfile, type VenueVisualProfile } from '../config/venueVisualProfiles';
import { FALLBACK_TINT, GRID_TINT, ZONE_TINT_ALPHA, ZONE_TINTS } from '../config/zones';
import type { BuildingMap, WallRect } from './BuildingMap';
import { selectKnownDecorations, type DecorationPoint } from './mapPresentation';
import {
  darkenColour,
  floorMaterialKey,
  lightenColour,
  paintFloorMaterial,
  paintPropContactGradient,
  paintWallContactGradient,
  propContactShadowSize,
  routeMaterialKind,
  zoneMaterialKind,
  PROP_CONTACT_TEXTURE_KEY,
  WALL_CONTACT_TEXTURE_KEY,
} from './materialTextures';

/** Spacing of the reference grid, matching the map's tile size. */
const GRID_STEP = 32;

/** The three shades one wall slab is built from, derived per venue profile. */
interface WallShades {
  topFace: number;
  highlight: number;
  southFace: number;
}

/**
 * Draws each venue from credited tiles: circulation routes and zones use tiled
 * materials, walls use the venue profile, and furniture comes from map data.
 * The 32px reference grid is kept as a debug overlay, hidden by default and
 * toggled with toggleGrid().
 *
 * Phase 19 adds the depth pass on top of that: a seeded procedural grain over
 * every floor (materials.ts), an extruded read on every wall slab, and contact
 * shadows where walls and furniture meet the ground. All of it is baked or
 * drawn once at level load, and all of it sits below the lighting veil at depth
 * 25 so darkness still swallows it exactly as before.
 *
 * Depth order: route -5, route grain -4.5, floor 0, floor grain 0.5, wash 1,
 * light pools 2, route cues 3, decals 4, wall drop shadow 9, wall contact
 * shadow 9.5, wall surface 10, wall extrusion 11, prop contact shadow 13.5,
 * prop silhouette 14, props 15, grid 20. The player (depth 40) stays above the
 * world.
 */
export class WorldRenderer {
  private readonly grid: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, map: BuildingMap, levelId: string) {
    const profile = getVenueVisualProfile(levelId);
    WorldRenderer.ensureMaterialTextures(scene);
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

  /**
   * Bakes every generated material once per session, guarded for scene restarts
   * the same way the lighting mask and the dust dot are. All of it is seeded, so
   * two runs of the same contract are pixel identical and nothing is generated
   * per frame.
   *
   * If a texture cannot be created (no canvas support) the key simply stays
   * missing and every caller below skips its overlay, which leaves the flat
   * Phase 10 floors and walls as the fallback rather than a broken frame.
   */
  private static ensureMaterialTextures(scene: Phaser.Scene): void {
    for (const kind of FLOOR_MATERIAL_KINDS) {
      const key = floorMaterialKey(kind);
      if (scene.textures.exists(key)) {
        continue;
      }
      const spec = FLOOR_MATERIAL_SPECS[kind];
      const texture = scene.textures.createCanvas(key, spec.size, spec.size);
      if (!texture) {
        continue;
      }
      paintFloorMaterial(texture.getContext(), spec);
      texture.refresh();
      // Left on the global nearest filter on purpose: the grain is pixel art
      // and must stay crisp against the Kenney tiles underneath.
    }

    if (!scene.textures.exists(WALL_CONTACT_TEXTURE_KEY)) {
      const { textureWidthPx, textureHeightPx } = CONTACT_SHADOW.wall;
      const strip = scene.textures.createCanvas(
        WALL_CONTACT_TEXTURE_KEY,
        textureWidthPx,
        textureHeightPx
      );
      if (strip) {
        paintWallContactGradient(strip.getContext(), textureWidthPx, textureHeightPx);
        strip.refresh();
        // Pixel textures are nearest-filtered globally. Both contact shadows are
        // the exception: a stepped ramp would read as banding, not occlusion.
        strip.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    if (!scene.textures.exists(PROP_CONTACT_TEXTURE_KEY)) {
      const size = CONTACT_SHADOW.prop.textureSizePx;
      const blob = scene.textures.createCanvas(PROP_CONTACT_TEXTURE_KEY, size, size);
      if (blob) {
        paintPropContactGradient(blob.getContext(), size);
        blob.refresh();
        blob.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }
  }

  /**
   * Lays one surface's procedural grain over a rectangle of floor. The tile
   * position is aligned to world space so grout and panel seams run unbroken
   * from room to room instead of restarting at every zone boundary.
   */
  private addMaterialOverlay(
    scene: Phaser.Scene,
    kind: FloorMaterialKind,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number
  ): void {
    const key = floorMaterialKey(kind);
    if (!scene.textures.exists(key) || MATERIAL_RENDER.strength <= 0) {
      return;
    }
    const { size } = FLOOR_MATERIAL_SPECS[kind];
    const overlay = scene.add.tileSprite(x + width / 2, y + height / 2, width, height, key);
    overlay.setTilePosition(Phaser.Math.Wrap(x, 0, size), Phaser.Math.Wrap(y, 0, size));
    overlay.setAlpha(MATERIAL_RENDER.strength);
    overlay.setDepth(depth);
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

    // The circulation surface gets a material too, so the corridors between the
    // named zones are not the one flat area left in the building.
    this.addMaterialOverlay(
      scene,
      routeMaterialKind(profile.id),
      0,
      0,
      map.widthInPixels,
      map.heightInPixels,
      MATERIAL_RENDER.routeDepth
    );
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

      // The room's material, under the colour wash below so the venue grading
      // still does the room-telling and this only adds surface.
      this.addMaterialOverlay(
        scene,
        zoneMaterialKind(zone.name),
        zone.x,
        zone.y,
        zone.width,
        zone.height,
        MATERIAL_RENDER.zoneDepth
      );

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
    const extrusion = scene.add.graphics().setDepth(WALL_EXTRUSION.depth);
    shadows.fillStyle(profile.wall.shadow.colour, profile.wall.shadow.alpha);

    // Every extrusion shade is derived from the venue's own wall edge colour, so
    // re-tinting a venue in venueVisualProfiles.ts carries straight through and
    // no new hue enters the palette.
    const shades: WallShades = {
      topFace: lightenColour(profile.wall.edge.colour, WALL_EXTRUSION.topFaceLighten),
      highlight: lightenColour(profile.wall.edge.colour, WALL_EXTRUSION.northHighlightLighten),
      southFace: darkenColour(profile.wall.edge.colour, WALL_EXTRUSION.southBandDarken),
    };

    for (const wall of map.walls) {
      const cx = wall.x + wall.width / 2;
      const cy = wall.y + wall.height / 2;
      shadows.fillRect(
        wall.x + profile.wall.shadow.offsetX,
        wall.y + profile.wall.shadow.offsetY,
        wall.width,
        wall.height
      );
      this.addWallContactShadow(scene, wall, profile);
      const wallSurface = scene.add.tileSprite(
        cx,
        cy,
        wall.width,
        wall.height,
        profile.wall.defaultTextureKey
      );
      wallSurface.setTileScale(profile.wall.textureScale, profile.wall.textureScale);
      wallSurface.setDepth(10);
      WorldRenderer.extrudeWall(extrusion, wall, shades);
    }
  }

  /**
   * Gives one wall slab its fake third dimension. The light is treated as
   * coming from the north: the top face lifts a shade, the north and west lips
   * catch a 1px highlight, and the south face goes dark because that is the
   * side of the slab you would see if the camera tilted. Together they replace
   * the flat Phase 10 edge banding.
   */
  private static extrudeWall(
    g: Phaser.GameObjects.Graphics,
    wall: WallRect,
    shades: WallShades
  ): void {
    g.fillStyle(shades.topFace, WALL_EXTRUSION.topFaceAlpha);
    g.fillRect(wall.x, wall.y, wall.width, wall.height);

    // Clamped so a thin wall cannot end up as nothing but its own side face.
    const band = Math.min(WALL_EXTRUSION.southBandPx, wall.height);
    g.fillStyle(shades.southFace, WALL_EXTRUSION.southBandAlpha);
    g.fillRect(wall.x, wall.y + wall.height - band, wall.width, band);

    g.fillStyle(shades.highlight, WALL_EXTRUSION.northHighlightAlpha);
    g.fillRect(wall.x, wall.y, wall.width, Math.min(WALL_EXTRUSION.northHighlightPx, wall.height));
    g.fillStyle(shades.highlight, WALL_EXTRUSION.westHighlightAlpha);
    g.fillRect(wall.x, wall.y, Math.min(WALL_EXTRUSION.westHighlightPx, wall.width), wall.height);
  }

  /**
   * The ambient occlusion strip where a wall's south face meets the floor. This
   * is the tight dark contact line, distinct from the venue's offset drop
   * shadow underneath it, and it is what stops walls looking like stickers.
   */
  private addWallContactShadow(
    scene: Phaser.Scene,
    wall: WallRect,
    profile: VenueVisualProfile
  ): void {
    if (!scene.textures.exists(WALL_CONTACT_TEXTURE_KEY)) {
      return;
    }
    scene.add
      .image(wall.x, wall.y + wall.height, WALL_CONTACT_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(wall.width, CONTACT_SHADOW.wall.heightPx)
      .setTint(profile.wall.shadow.colour)
      .setAlpha(CONTACT_SHADOW.wall.alpha)
      .setDepth(CONTACT_SHADOW.wall.depth);
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
      const sprite = this.addDecorationSprite(scene, prop, 15);
      this.addPropContactShadow(scene, prop, sprite, profile);
    }
  }

  /**
   * The soft blob that grounds a piece of furniture, the same read the
   * characters already get from ART.shadow. It sits under the silhouette drop
   * shadow rather than replacing it: the silhouette gives the prop its cast
   * direction, this gives it weight. It follows the prop's rotation so a turned
   * desk still sits in its own footprint. Decals are floor markings painted on
   * the ground, so they deliberately get none.
   */
  private addPropContactShadow(
    scene: Phaser.Scene,
    prop: DecorationPoint,
    sprite: Phaser.GameObjects.Sprite,
    profile: VenueVisualProfile
  ): void {
    if (!scene.textures.exists(PROP_CONTACT_TEXTURE_KEY)) {
      return;
    }
    const { width, height } = propContactShadowSize(
      sprite.displayWidth,
      sprite.displayHeight
    );
    scene.add
      .image(
        prop.x,
        prop.y + sprite.displayHeight * CONTACT_SHADOW.prop.offsetFactor,
        PROP_CONTACT_TEXTURE_KEY
      )
      .setDisplaySize(width, height)
      .setAngle(prop.rotation)
      .setTint(profile.propShadow.colour)
      .setAlpha(CONTACT_SHADOW.prop.alpha * prop.alpha)
      .setDepth(CONTACT_SHADOW.prop.depth);
  }

  private addDecorationSprite(
    scene: Phaser.Scene,
    decoration: DecorationPoint,
    depth: number
  ): Phaser.GameObjects.Sprite {
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
    // Returned so callers that need the on-screen size, such as the prop
    // contact shadow, do not have to recompute the scaling.
    return sprite;
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
