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

/** A furniture prop read from the Tiled `props` object layer. */
export interface PropPoint {
  /** Texture key to draw, matching a key in IMAGE_ASSETS (e.g. "prop_desk"). */
  key: string;
  x: number;
  y: number;
}

/** A light source read from the Tiled `lights` layer. */
export interface LightRect {
  id: string;
  /** "pool" | "flood" | "rack". */
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An objective marker read from the Tiled `objectives` layer. */
export interface ObjectivePoint {
  /** Objective id, e.g. "rack4", "workstation", "stickynote". */
  id: string;
  /** What interacting does: "plant" or "photo". */
  kind: string;
  x: number;
  y: number;
}

/** How a door opens. Matches the `type` on each object in the Tiled `doors` layer. */
export type DoorKind = 'badge' | 'smokers' | 'shutter';

/** A door read from the Tiled `doors` object layer. */
export interface DoorRect {
  id: string;
  kind: DoorKind;
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
  readonly props: PropPoint[];
  readonly doors: DoorRect[];
  readonly objectives: ObjectivePoint[];
  readonly lights: LightRect[];
  readonly spawn: Phaser.Math.Vector2;
  readonly widthInPixels: number;
  readonly heightInPixels: number;

  constructor(scene: Phaser.Scene, key: string) {
    const map = scene.make.tilemap({ key });
    this.widthInPixels = map.widthInPixels;
    this.heightInPixels = map.heightInPixels;

    this.zones = BuildingMap.readZones(map);
    this.walls = BuildingMap.readWalls(map);
    this.props = BuildingMap.readProps(map);
    this.doors = BuildingMap.readDoors(map);
    this.objectives = BuildingMap.readObjectives(map);
    this.lights = BuildingMap.readLights(map);
    this.spawn = BuildingMap.readSpawn(map);
  }

  private static readLights(map: Phaser.Tilemaps.Tilemap): LightRect[] {
    const layer = map.getObjectLayer('lights');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      id: obj.name ?? '',
      kind: obj.type ?? 'pool',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    }));
  }

  private static readObjectives(map: Phaser.Tilemaps.Tilemap): ObjectivePoint[] {
    const layer = map.getObjectLayer('objectives');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      id: obj.name ?? '',
      kind: obj.type ?? 'photo',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
    }));
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

  private static readProps(map: Phaser.Tilemaps.Tilemap): PropPoint[] {
    const layer = map.getObjectLayer('props');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      key: obj.name ?? '',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
    }));
  }

  private static readDoors(map: Phaser.Tilemaps.Tilemap): DoorRect[] {
    const layer = map.getObjectLayer('doors');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      id: obj.name ?? '',
      kind: (obj.type ?? 'badge') as DoorKind,
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
