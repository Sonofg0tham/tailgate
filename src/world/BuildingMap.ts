import Phaser from 'phaser';
import {
  readDecorationLayer,
  type DecorationLayer,
  type DecorationPoint,
} from './mapPresentation';

/** A named floor area read from the Tiled `zones` object layer. */
export interface ZoneRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the zone is flagged restricted in Tiled: no hi-vis excuse here. */
  restricted: boolean;
  /** True when the zone is outdoors (the car park): drives ingress tracking. */
  exterior: boolean;
}

/** A pickup read from the Tiled `pickups` object layer (e.g. a hi-vis vest). */
export interface PickupPoint {
  /** What the pickup is, from the object's type: currently only "hivis". */
  kind: string;
  x: number;
  y: number;
}

/** A collision rectangle read from the Tiled `walls` object layer. */
export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A furniture prop read from the Tiled `props` object layer. */
export type PropPoint = DecorationPoint;

/** A non-colliding visual sprite read from the optional Tiled `decals` layer. */
export type DecalPoint = DecorationPoint;

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

/** An ambient effect read from the Tiled `effects` layer. */
export interface EffectPoint {
  /** "steam" | "haze", from the object's type. */
  kind: string;
  x: number;
  y: number;
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
  readonly decals: DecalPoint[];
  readonly doors: DoorRect[];
  readonly objectives: ObjectivePoint[];
  readonly lights: LightRect[];
  readonly pickups: PickupPoint[];
  readonly effects: EffectPoint[];
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
    this.decals = BuildingMap.readDecals(map);
    this.doors = BuildingMap.readDoors(map);
    this.objectives = BuildingMap.readObjectives(map);
    this.lights = BuildingMap.readLights(map);
    this.pickups = BuildingMap.readPickups(map);
    this.effects = BuildingMap.readEffects(map);
    this.spawn = BuildingMap.readSpawn(map);
  }

  private static readEffects(map: Phaser.Tilemaps.Tilemap): EffectPoint[] {
    const layer = map.getObjectLayer('effects');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      kind: obj.type ?? obj.name ?? '',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
    }));
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
      restricted: BuildingMap.boolProperty(obj, 'restricted'),
      exterior: BuildingMap.boolProperty(obj, 'exterior'),
    }));
  }

  /** Reads a boolean custom property off a Tiled object, defaulting false. */
  private static boolProperty(obj: Phaser.Types.Tilemaps.TiledObject, name: string): boolean {
    const props = obj.properties as { name: string; value: unknown }[] | undefined;
    const found = props?.find((p) => p.name === name);
    return found?.value === true;
  }

  private static readPickups(map: Phaser.Tilemaps.Tilemap): PickupPoint[] {
    const layer = map.getObjectLayer('pickups');
    if (!layer) {
      return [];
    }
    return layer.objects.map((obj) => ({
      kind: obj.type ?? obj.name ?? '',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
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
    const layer = map.getObjectLayer('props') as unknown as DecorationLayer | null;
    return readDecorationLayer(layer ?? undefined);
  }

  private static readDecals(map: Phaser.Tilemaps.Tilemap): DecalPoint[] {
    const layer = map.getObjectLayer('decals') as unknown as DecorationLayer | null;
    return readDecorationLayer(layer ?? undefined);
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
