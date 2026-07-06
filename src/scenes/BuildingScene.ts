import Phaser from 'phaser';
import { DETECTION } from '../config/detection';
import { MOVEMENT } from '../config/movement';
import { FONTS, PALETTE } from '../config/palette';
import { THROW } from '../config/throw';
import { IMAGE_ASSETS } from '../config/tiles';
import { Door } from '../entities/Door';
import { Guard, type GuardState, type PatrolNode } from '../entities/Guard';
import { Player } from '../entities/Player';
import { Staff, type StaffDef } from '../entities/Staff';
import type { KeyboardKeys } from '../input/KeyboardInput';
import { MovementController } from '../input/MovementController';
import {
  getMission,
  raiseAlert,
  decayAlert,
  touchAlert,
  setCheckpoint,
} from '../state/mission';
import {
  getRunStats,
  recordAlertLevel,
  recordDetain,
  recordExfil,
  recordIngress,
  recordSpotted,
  type IngressRoute,
} from '../state/runStats';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import { ThrowController } from '../systems/ThrowController';
import { DebugOverlay, type GuardHudInfo } from '../ui/DebugOverlay';
import { BuildingMap } from '../world/BuildingMap';
import { WorldRenderer } from '../world/WorldRenderer';

const MAP_KEY = 'buildingC';
const GUARD_DATA_KEY = 'guards';
const STAFF_DATA_KEY = 'staff';

/** How close authorised staff must be to a badge door to open it. */
const STAFF_BADGE_DISTANCE = 75;

/** How close a staff member counts as bumping the player (cancels a hold). */
const STAFF_BUMP_DISTANCE = 26;

/** The building alert level names, indexed by level. */
const SITE_LABELS = ['CALM', 'CAUTIOUS', 'LOCKDOWN'] as const;

interface GuardsData {
  guards: { id: string; route: PatrolNode[]; cautiousExtra?: PatrolNode[] }[];
}
interface StaffData {
  staff: StaffDef[];
}

/**
 * The gameplay scene. Building C, the player at the van, one patrolling guard,
 * staff on their rounds, and three gated ways in: a badge gate you tailgate, a
 * timed smokers' door and a timed loading-dock shutter. The player can throw
 * bolts to distract the guard, and running footsteps make noise the guard hears.
 */
export class BuildingScene extends Phaser.Scene {
  private player!: Player;
  private controller!: MovementController;
  private overlay!: DebugOverlay;
  private world!: WorldRenderer;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private keys?: KeyboardKeys;
  private guard?: Guard;
  private doors: Door[] = [];
  private staff: Staff[] = [];
  private throwController!: ThrowController;
  private objectives!: ObjectiveSystem;
  private promptText!: Phaser.GameObjects.Text;
  private guardDebug!: Phaser.GameObjects.Graphics;
  private guardDebugOn = false;
  private detained = false;
  private missionOver = false;
  private radioedThisEpisode = false;
  private appliedAlertLevel = -1;
  private playerWasOutside = true;
  private baseRoute: PatrolNode[] = [];
  private cautiousExtra: PatrolNode[] = [];
  private gridKey?: Phaser.Input.Keyboard.Key;
  private guardDebugKey?: Phaser.Input.Keyboard.Key;
  private interactKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super('building');
  }

  preload(): void {
    this.load.tilemapTiledJSON(MAP_KEY, 'maps/building-c.json');
    this.load.json(GUARD_DATA_KEY, 'data/guards.json');
    this.load.json(STAFF_DATA_KEY, 'data/staff.json');
    for (const [key, path] of Object.entries(IMAGE_ASSETS)) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.detained = false;
    this.missionOver = false;
    this.radioedThisEpisode = false;
    this.appliedAlertLevel = -1;
    this.doors = [];
    this.staff = [];

    const map = new BuildingMap(this, MAP_KEY);
    this.world = new WorldRenderer(this, map);

    // A detain restarts here: resume from the last checkpoint if there is one.
    // Checkpoints are always indoors, so a checkpoint start begins inside.
    const checkpoint = getMission().checkpoint;
    this.playerWasOutside = !checkpoint;
    const startX = checkpoint?.x ?? map.spawn.x;
    const startY = checkpoint?.y ?? map.spawn.y;
    this.player = new Player(this, startX, startY);
    this.buildWalls(map);
    this.spawnGuard(map);
    this.spawnDoors(map);
    this.spawnStaff();
    this.wireDoorColliders();
    this.objectives = new ObjectiveSystem(this, map.objectives, map.spawn.clone());

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
    this.guardDebug = this.add.graphics().setDepth(50);
    this.throwController = new ThrowController(
      this,
      (x, y) => this.onNoise(x, y),
      checkpoint?.bolts
    );

    // The mission prompt, bottom centre, screen fixed.
    this.promptText = this.add
      .text(this.scale.width / 2, this.scale.height - 28, '', {
        fontFamily: FONTS.mono,
        fontSize: '15px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);

    // Debug toggles. Edge-triggered keys so nothing stacks up on scene.restart.
    this.gridKey = this.input.keyboard?.addKey('G');
    this.guardDebugKey = this.input.keyboard?.addKey('H');
    this.interactKey = this.input.keyboard?.addKey('E');
  }

  update(_time: number, delta: number): void {
    if (this.gridKey && Phaser.Input.Keyboard.JustDown(this.gridKey)) {
      this.world.toggleGrid();
    }
    if (this.guardDebugKey && Phaser.Input.Keyboard.JustDown(this.guardDebugKey)) {
      this.guardDebugOn = !this.guardDebugOn;
      if (!this.guardDebugOn) {
        this.guardDebug.clear();
      }
    }

    if (this.detained || this.missionOver) {
      return; // frozen during the DETAINED flash or the handover to the report
    }

    const now = this.time.now;
    const gamepadPlugin = this.input.gamepad;
    const pad =
      gamepadPlugin && gamepadPlugin.total > 0 ? gamepadPlugin.getPad(0) : undefined;

    const intent = this.controller.update(pad, this.keys);
    this.player.applyMotion(intent, delta);

    this.updateAlertLevel(now);
    this.updateDoorsAndStaff(now);
    this.trackIngressAndCheckpoint();
    this.hearFootsteps();

    if (this.guard) {
      const closedDoors = this.doors.filter((d) => !d.isOpen).map((d) => d.rect);
      const tick = this.guard.update(
        now,
        delta,
        this.player.x,
        this.player.y,
        intent.speed,
        closedDoors
      );
      if (tick.spottedNow) {
        recordSpotted();
      }
      if (tick.caughtPlayer) {
        this.detain();
        return;
      }
      this.witnessTailgate();
      this.updateRadio(now);
    }

    const objTick = this.objectives.update({
      now,
      dtMs: delta,
      playerX: this.player.x,
      playerY: this.player.y,
      interactHeld: this.isInteractHeld(pad),
      playerMoving: intent.speed !== 'idle',
      seenByGuard: this.guard?.canSeePlayer ?? false,
      bumped: this.isBumped(),
    });
    if (objTick.plantedNow) {
      // Second checkpoint: immediately after planting the device.
      setCheckpoint({
        x: this.player.x,
        y: this.player.y,
        bolts: this.throwController.remaining,
      });
    }
    if (objTick.exfilNow) {
      this.missionOver = true;
      recordExfil();
      this.scene.start('report');
      return;
    }
    this.promptText.setText(objTick.prompt ?? '');

    this.throwController.update(this, delta, this.player.x, this.player.y, pad);

    this.overlay.update(this.player, intent, {
      bolts: this.throwController.remaining,
      site: SITE_LABELS[getMission().alertLevel] ?? 'CALM',
      guard: this.guardInfo(),
      doors: this.doorDebugLines(),
    });
    this.drawGuardDebug();
  }

  /** True while the interact control is held: E on keyboard, A on the pad. */
  private isInteractHeld(pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    if (this.interactKey?.isDown) {
      return true;
    }
    return pad ? pad.A : false;
  }

  /** True if a staff member or the guard is pressed up against the player. */
  private isBumped(): boolean {
    if (
      this.guard &&
      Phaser.Math.Distance.Between(this.guard.x, this.guard.y, this.player.x, this.player.y) <=
        STAFF_BUMP_DISTANCE
    ) {
      return true;
    }
    for (const member of this.staff) {
      if (
        Phaser.Math.Distance.Between(member.x, member.y, this.player.x, this.player.y) <=
        STAFF_BUMP_DISTANCE
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * The guard radio rule: an ALERT guard raises the building alert level once
   * its alert has lasted radioAfterMs, unless the player broke line of sight
   * first. Each radio raises one level; level 2 (lockdown) never decays.
   */
  private updateRadio(now: number): void {
    const guard = this.guard;
    if (!guard || guard.state !== 'alert') {
      this.radioedThisEpisode = false;
      return;
    }
    touchAlert(now);
    if (
      !this.radioedThisEpisode &&
      guard.alertSince > 0 &&
      now - guard.alertSince >= DETECTION.alert.radioAfterMs &&
      guard.canSeePlayer
    ) {
      this.radioedThisEpisode = true;
      const level = raiseAlert(now);
      recordAlertLevel(level);
    }
  }

  /** Applies level decay and (re)applies guard effects when the level changes. */
  private updateAlertLevel(now: number): void {
    decayAlert(now, DETECTION.alert.level1DecayMs);
    const level = getMission().alertLevel;
    if (level === this.appliedAlertLevel || !this.guard) {
      return;
    }
    this.appliedAlertLevel = level;
    this.guard.speedMultiplier =
      level >= 2
        ? DETECTION.alert.level2SpeedMult
        : level >= 1
          ? DETECTION.alert.level1SpeedMult
          : 1;
    // Cautious and lockdown add the extra sweep nodes to the patrol.
    this.guard.setRoute(level >= 1 ? [...this.baseRoute, ...this.cautiousExtra] : this.baseRoute);
  }

  /** Records which entrance the player uses and sets the first checkpoint. */
  private trackIngressAndCheckpoint(): void {
    // Ingress only counts INWARD: the player must have been outside (in the car
    // park) when they reach the doorway, so walking out again is not a finding.
    if (this.playerWasOutside) {
      for (const door of this.doors) {
        if (door.isOpen && door.contains(this.player.x, this.player.y)) {
          recordIngress(door.id as IngressRoute);
        }
      }
    }
    // Track which side of the entrance wall the player is on. The door band
    // spans y1216-1256; clear of it on either side updates the flag.
    if (this.player.y > 1260) {
      this.playerWasOutside = true;
    } else if (this.player.y < 1212) {
      this.playerWasOutside = false;
    }
    // First checkpoint: on first entering the building. The building interior
    // is everything above the entrance wall line.
    if (!getMission().checkpoint && this.player.y < 1190) {
      setCheckpoint({
        x: this.player.x,
        y: this.player.y,
        bolts: this.throwController.remaining,
      });
    }
  }

  private spawnDoors(map: BuildingMap): void {
    this.doors = map.doors.map((rect) => new Door(this, rect));
  }

  private spawnStaff(): void {
    const data = this.cache.json.get(STAFF_DATA_KEY) as StaffData | undefined;
    for (const def of data?.staff ?? []) {
      this.staff.push(new Staff(this, def));
    }
  }

  private wireDoorColliders(): void {
    for (const door of this.doors) {
      this.physics.add.collider(this.player.sprite, door.gameObject);
      if (this.guard) {
        this.physics.add.collider(this.guard.sprite, door.gameObject);
      }
      for (const member of this.staff) {
        this.physics.add.collider(member.sprite, door.gameObject);
      }
    }
  }

  /** Advances doors and staff, and lets authorised staff badge open badge doors. */
  private updateDoorsAndStaff(now: number): void {
    const lockdown = getMission().alertLevel >= 2;
    for (const member of this.staff) {
      member.update(now);
    }
    for (const door of this.doors) {
      if (door.kind === 'badge') {
        // Any authorised staff standing near a badge door opens it (the tailgate
        // window keeps it open for a moment after they walk on). In lockdown the
        // badge readers deny everyone, staff included.
        for (const member of this.staff) {
          if (
            member.isAuthorisedFor(door.id) &&
            Phaser.Math.Distance.Between(member.x, member.y, door.centreX, door.centreY) <
              STAFF_BADGE_DISTANCE
          ) {
            door.badge(now, lockdown);
          }
        }
      }
      door.update(now, lockdown);
    }
  }

  /** Running (and, up close, walking) footsteps make noise the guard investigates. */
  private hearFootsteps(): void {
    if (!this.guard || this.player.noiseRadius <= 0) {
      return;
    }
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.guard.x,
      this.guard.y
    );
    if (dist <= this.player.noiseRadius) {
      this.guard.investigatePoint(this.player.x, this.player.y);
    }
  }

  /** A bolt landed: pull any guard within earshot to investigate the spot. */
  private onNoise(x: number, y: number): void {
    if (!this.guard) {
      return;
    }
    if (Phaser.Math.Distance.Between(x, y, this.guard.x, this.guard.y) <= THROW.noiseRadiusPx) {
      this.guard.investigatePoint(x, y);
    }
  }

  /** If the player slips through an open badge door in a guard's sight, it reacts. */
  private witnessTailgate(): void {
    if (!this.guard || !this.guard.canSeePlayer) {
      return;
    }
    for (const door of this.doors) {
      if (door.kind === 'badge' && door.isOpen && door.contains(this.player.x, this.player.y)) {
        this.guard.investigatePoint(this.player.x, this.player.y);
        return;
      }
    }
  }

  private spawnGuard(map: BuildingMap): void {
    const data = this.cache.json.get(GUARD_DATA_KEY) as GuardsData | undefined;
    const first = data?.guards?.[0];
    if (!first || first.route.length === 0) {
      return;
    }
    this.baseRoute = first.route;
    this.cautiousExtra = first.cautiousExtra ?? [];
    this.guard = new Guard(this, first.route, map.walls, (state) => this.onGuardStateCue(state));
    this.physics.add.collider(this.guard.sprite, this.walls);
  }

  /** Caught: flash DETAINED, then reset the whole scene back to the start. */
  private detain(): void {
    recordDetain();
    this.detained = true;
    this.physics.pause();

    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xff3b30, 0.25)
      .setScrollFactor(0)
      .setDepth(1999);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'DETAINED', {
        fontFamily: FONTS.display,
        fontSize: '64px',
        color: PALETTE.alarm,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000);

    this.time.delayedCall(DETECTION.timing.detainedFlashMs, () => this.scene.restart());
  }

  /** Placeholder for the Phase 5 audio pass: alert sting and curious cue fire here. */
  private onGuardStateCue(_state: GuardState): void {
    // Intentionally silent until Phase 5 wires up audio.
  }

  private guardInfo(): GuardHudInfo | null {
    if (!this.guardDebugOn || !this.guard) {
      return null;
    }
    const stats = getRunStats();
    return {
      state: this.guard.state,
      suspicion: this.guard.suspicion,
      sees: this.guard.canSeePlayer,
      spotted: stats.timesSpotted,
      detains: stats.detains,
    };
  }

  private doorDebugLines(): string[] | null {
    if (!this.guardDebugOn) {
      return null;
    }
    return this.doors.map((d) => `${d.id.padEnd(7)} ${d.isOpen ? 'OPEN' : 'shut'}`);
  }

  /** Guard debug (H): the sight line to the player and a suspicion bar overhead. */
  private drawGuardDebug(): void {
    this.guardDebug.clear();
    if (!this.guardDebugOn || !this.guard) {
      return;
    }
    const g = this.guard;

    const seen = g.canSeePlayer;
    this.guardDebug.lineStyle(1.5, seen ? 0x36f06a : 0x555a63, seen ? 0.9 : 0.5);
    this.guardDebug.lineBetween(g.x, g.y, this.player.x, this.player.y);

    const barW = 40;
    const barH = 5;
    const bx = g.x - barW / 2;
    const by = g.y - 34;
    this.guardDebug.fillStyle(0x000000, 0.5);
    this.guardDebug.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const colour =
      g.state === 'alert' ? 0xff3b30 : g.state === 'curious' ? 0xffb000 : 0xc7cdd4;
    this.guardDebug.fillStyle(colour, 1);
    this.guardDebug.fillRect(bx, by, barW * (g.suspicion / 100), barH);
  }

  /** Turns each wall rectangle from the map into a static collision body. */
  private buildWalls(map: BuildingMap): void {
    this.walls = this.physics.add.staticGroup();
    for (const wall of map.walls) {
      // Tiled gives the top-left corner; Arcade bodies position by centre.
      const centreX = wall.x + wall.width / 2;
      const centreY = wall.y + wall.height / 2;
      const rect = this.add.rectangle(centreX, centreY, wall.width, wall.height);
      this.physics.add.existing(rect, true);
      this.walls.add(rect);
    }
    this.physics.add.collider(this.player.sprite, this.walls);
  }

  /** Sets up WASD, arrow keys, Shift (creep), C (run) and the debug toggles. */
  private buildKeyboard(): KeyboardKeys | undefined {
    const kb = this.input.keyboard;
    if (!kb) {
      return undefined;
    }

    // Stop these keys scrolling the page or triggering browser shortcuts.
    kb.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,C,G,H,E');

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
