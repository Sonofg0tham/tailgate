import Phaser from 'phaser';

/** A named floor area read from the Tiled `zones` object layer. */
export interface ZoneRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A collision rectangle read from the Tiled `walls` object layer. */
export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Loads the hand-authored Building C map and reads its object layers into plain
 * data. Nothing is rendered here; the renderer and the scene decide what to draw
 * and where collision lives. Keeping this pure means the map stays data, not code.
 *
 * Tiled rectangle objects give their x/y as the TOP-LEFT corner, y pointing down,
 * which matches Phaser world space, so no coordinate flipping is needed.
 */
export class BuildingMap {
  readonly zones: ZoneRect[];
  readonly walls: WallRect[];
  readonly spawn: Phaser.Math.Vector2;
  readonly widthInPixels: number;
  readonly heightInPixels: number;

  constructor(scene: Phaser.Scene, key: string) {
    const map = scene.make.tilemap({ key });
    this.widthInPixels = map.widthInPixels;
    this.heightInPixels = map.heightInPixels;

    this.zones = BuildingMap.readZones(map);
    this.walls = BuildingMap.readWalls(map);
    this.spawn = BuildingMap.readSpawn(map);
  }

  private static readZones(map: Phaser.Tilemaps.Tilemap): ZoneRect[] {
    const layer = map.getObjectLayer('zones');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      name: obj.name ?? '',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    }));
  }

  private static readWalls(map: Phaser.Tilemaps.Tilemap): WallRect[] {
    const layer = map.getObjectLayer('walls');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    }));
  }

  private static readSpawn(map: Phaser.Tilemaps.Tilemap): Phaser.Math.Vector2 {
    const layer = map.getObjectLayer('spawn');
    const start = layer?.objects.find((obj) => obj.name === 'playerStart');
    return new Phaser.Math.Vector2(start?.x ?? 0, start?.y ?? 0);
  }
}
