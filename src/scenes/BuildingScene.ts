import Phaser from 'phaser';
import { MOVEMENT } from '../config/movement';
import { Player } from '../entities/Player';
import type { KeyboardKeys } from '../input/KeyboardInput';
import { MovementController } from '../input/MovementController';
import { DebugOverlay } from '../ui/DebugOverlay';
import { BuildingMap } from '../world/BuildingMap';
import { GreyboxRenderer } from '../world/GreyboxRenderer';

const MAP_KEY = 'buildingC';

/**
 * The real gameplay scene for Phase 1: load Building C, render it in greybox,
 * drop the player at the van and let them creep, walk and run around the whole
 * floor plan with the noise radius on show. No guards or objectives yet.
 */
export class BuildingScene extends Phaser.Scene {
  private player!: Player;
  private controller!: MovementController;
  private overlay!: DebugOverlay;
  private keys?: KeyboardKeys;

  constructor() {
    super('building');
  }

  preload(): void {
    this.load.tilemapTiledJSON(MAP_KEY, 'maps/building-c.json');
  }

  create(): void {
    const map = new BuildingMap(this, MAP_KEY);
    new GreyboxRenderer(this, map);

    this.player = new Player(this, map.spawn.x, map.spawn.y);
    this.buildWalls(map);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(
      this.player.sprite,
      true,
      MOVEMENT.camera.lerp,
      MOVEMENT.camera.lerp
    );

    this.keys = this.buildKeyboard();
    this.controller = new MovementController(this.player);
    this.overlay = new DebugOverlay(this);
  }

  update(): void {
    const gamepadPlugin = this.input.gamepad;
    const pad =
      gamepadPlugin && gamepadPlugin.total > 0 ? gamepadPlugin.getPad(0) : undefined;

    const intent = this.controller.update(pad, this.keys);
    this.overlay.update(this.player, intent);
  }

  /** Turns each wall rectangle from the map into a static collision body. */
  private buildWalls(map: BuildingMap): void {
    const walls = this.physics.add.staticGroup();
    for (const wall of map.walls) {
      // Tiled gives the top-left corner; Arcade bodies position by centre.
      const centreX = wall.x + wall.width / 2;
      const centreY = wall.y + wall.height / 2;
      const rect = this.add.rectangle(centreX, centreY, wall.width, wall.height);
      this.physics.add.existing(rect, true);
      walls.add(rect);
    }
    this.physics.add.collider(this.player.sprite, walls);
  }

  /** Sets up WASD, arrow keys, Shift (creep) and C (run) with page-scroll capture. */
  private buildKeyboard(): KeyboardKeys | undefined {
    const kb = this.input.keyboard;
    if (!kb) {
      return undefined;
    }

    // Stop these keys scrolling the page or triggering browser shortcuts.
    kb.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,C');

    const cursors = kb.createCursorKeys();
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const extra = kb.addKeys({
      w: codes.W,
      a: codes.A,
      s: codes.S,
      d: codes.D,
      run: codes.C,
    }) as Record<'w' | 'a' | 's' | 'd' | 'run', Phaser.Input.Keyboard.Key>;

    return {
      up: cursors.up,
      down: cursors.down,
      left: cursors.left,
      right: cursors.right,
      w: extra.w,
      a: extra.a,
      s: extra.s,
      d: extra.d,
      creep: cursors.shift,
      run: extra.run,
    };
  }
}
