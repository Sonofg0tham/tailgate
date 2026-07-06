import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { DETECTION } from '../config/detection';
import { JUICE } from '../config/juice';
import { LIGHTING } from '../config/lighting';
import { MOVEMENT } from '../config/movement';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { THROW } from '../config/throw';
import { IMAGE_ASSETS } from '../config/tiles';
import { Door } from '../entities/Door';
import { Guard, type GuardState, type PatrolNode } from '../entities/Guard';
import { Player } from '../entities/Player';
import { Staff, type StaffDef } from '../entities/Staff';
import type { KeyboardKeys } from '../input/KeyboardInput';
import { MovementController } from '../input/MovementController';
import { getSettings } from '../state/settings';
import { CameraSystem, type CamerasData } from '../systems/CameraSystem';
import { LightModel } from '../systems/LightModel';
import { LightingRenderer } from '../systems/LightingRenderer';
import type { WallRect, ZoneRect } from '../world/BuildingMap';
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
const CAMERA_DATA_KEY = 'cameras';

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
  private cameraSystem!: CameraSystem;
  private lightModel!: LightModel;
  private lightingRenderer!: LightingRenderer;
  private audio!: AudioManager;
  private mapZones: ZoneRect[] = [];
  private mapWalls: WallRect[] = [];
  private followOffset = new Phaser.Math.Vector2(0, 0);
  private promptText!: Phaser.GameObjects.Text;
  private guardDebug!: Phaser.GameObjects.Graphics;
  private guardDebugOn = false;
  private lightingHidden = false;
  private detained = false;
  private missionOver = false;
  private radioedThisEpisode = false;
  private appliedAlertLevel = -1;
  private playerWasOutside = true;
  private baseRoute: PatrolNode[] = [];
  private cautiousExtra: PatrolNode[] = [];
  private gridKey?: Phaser.Input.Keyboard.Key;
  private guardDebugKey?: Phaser.Input.Keyboard.Key;
  private lightingKey?: Phaser.Input.Keyboard.Key;
  private interactKey?: Phaser.Input.Keyboard.Key;
  /** Last frame's pad A state, so the breaker sees a fresh press not a hold. */
  private padInteractWasDown = false;

  constructor() {
    super('building');
  }

  preload(): void {
    this.load.tilemapTiledJSON(MAP_KEY, 'maps/building-c.json');
    this.load.json(GUARD_DATA_KEY, 'data/guards.json');
    this.load.json(STAFF_DATA_KEY, 'data/staff.json');
    this.load.json(CAMERA_DATA_KEY, 'data/cameras.json');
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
    this.followOffset.set(0, 0);

    const map = new BuildingMap(this, MAP_KEY);
    this.mapZones = map.zones;
    this.mapWalls = map.walls;
    this.world = new WorldRenderer(this, map);
    this.lightModel = new LightModel(map.zones, map.lights);

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
    this.cameraSystem = new CameraSystem(
      this,
      map.walls,
      this.cache.json.get(CAMERA_DATA_KEY) as CamerasData | undefined
    );

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(
      this.player.sprite,
      true,
      MOVEMENT.camera.lerp,
      MOVEMENT.camera.lerp
    );
    this.cameras.main.setDeadzone(JUICE.camera.deadzoneW, JUICE.camera.deadzoneH);

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

    // Lighting and audio. The renderer draws last each frame; audio arms its
    // autoplay unlock on the first input and makes no sound before that.
    this.lightingRenderer = new LightingRenderer(this);
    this.audio = new AudioManager();
    this.audio.init(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.suspendForRestart());

    // Debug toggles. Edge-triggered keys so nothing stacks up on scene.restart.
    this.gridKey = this.input.keyboard?.addKey('G');
    this.guardDebugKey = this.input.keyboard?.addKey('H');
    this.lightingKey = this.input.keyboard?.addKey('L');
    this.interactKey = this.input.keyboard?.addKey('E');

    if (import.meta.env.DEV) {
      const dev = this as unknown as {
        __lightModel: LightModel;
        __cameras: CameraSystem;
        __audio: AudioManager;
        __fillMultiplierAt: (x: number, y: number) => number;
      };
      dev.__lightModel = this.lightModel;
      dev.__cameras = this.cameraSystem;
      dev.__audio = this.audio;
      dev.__fillMultiplierAt = (x, y) =>
        Phaser.Math.Linear(LIGHTING.concealmentFloor, 1, this.lightModel.computeLightAt(x, y));
    }
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
    if (this.lightingKey && Phaser.Input.Keyboard.JustDown(this.lightingKey)) {
      this.lightingHidden = !this.lightingHidden;
      this.lightingRenderer.setVisible(!this.lightingHidden);
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
    this.updateLookAhead(intent.direction);

    this.updateAlertLevel(now);
    this.updateDoorsAndStaff(now);
    this.trackIngressAndCheckpoint();
    this.hearFootsteps();

    // Shared occluder set for the guard, cameras and audio this frame.
    const closedDoors = this.doors.filter((d) => !d.isOpen).map((d) => d.rect);

    if (this.guard) {
      // The guard's own sightline lights where it looks; darkness elsewhere is
      // cover, so sample the light at the player and feed it into perception.
      this.lightModel.setGuardTorch(this.guard.x, this.guard.y, this.guard.facingAngle);
      const lightAtPlayer = this.lightModel.computeLightAt(this.player.x, this.player.y);
      const tick = this.guard.update(
        now,
        delta,
        this.player.x,
        this.player.y,
        intent.speed,
        closedDoors,
        lightAtPlayer
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
    } else {
      this.lightModel.clearGuardTorch();
    }

    // Cameras run after the guard so a curious ping targets its fresh state and
    // a camera-driven alert lands in the same escalation slot as the radio.
    const camTick = this.cameraSystem.update(
      now,
      delta,
      this.player.x,
      this.player.y,
      closedDoors,
      this.isInteractJustPressed(pad)
    );
    for (const p of camTick.investigatePoints) {
      this.guard?.investigatePoint(p.x, p.y);
    }
    if (camTick.raisedAlert) {
      const level = raiseAlert(now);
      recordAlertLevel(level);
      this.triggerAlarmShake();
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
    // The objective prompt wins; the breaker prompt shows only when free.
    this.promptText.setText(objTick.prompt ?? camTick.prompt ?? '');

    this.throwController.update(this, delta, this.player.x, this.player.y, pad);

    this.audio.update({
      nowMs: now,
      player: { x: this.player.x, y: this.player.y },
      guard: this.guard ? { x: this.guard.x, y: this.guard.y, state: this.guard.state } : null,
      playerSpeed: intent.speed,
      zones: this.mapZones,
      walls: this.mapWalls,
      closedDoorRects: closedDoors,
      alertLevel: getMission().alertLevel,
    });

    this.overlay.update(this.player, intent, {
      bolts: this.throwController.remaining,
      site: SITE_LABELS[getMission().alertLevel] ?? 'CALM',
      light: this.guardDebugOn
        ? Math.round(this.lightModel.computeLightAt(this.player.x, this.player.y) * 100)
        : null,
      guard: this.guardInfo(),
      doors: this.doorDebugLines(),
      cameras: this.guardDebugOn ? this.cameraSystem.debugLines() : null,
    });
    this.drawGuardDebug();

    // Lighting draws last so it reflects this frame's final positions.
    this.lightingRenderer.update(
      this.cameras.main,
      this.player,
      this.guard,
      this.lightModel.sources
    );
  }

  /** Eases the camera to lead the player's travel a touch, for comfort. */
  private updateLookAhead(dir: Phaser.Math.Vector2): void {
    const targetX = dir.x * JUICE.camera.lookAheadPx;
    const targetY = dir.y * JUICE.camera.lookAheadPx;
    this.followOffset.x = Phaser.Math.Linear(this.followOffset.x, targetX, JUICE.camera.lookAheadLerp);
    this.followOffset.y = Phaser.Math.Linear(this.followOffset.y, targetY, JUICE.camera.lookAheadLerp);
    this.cameras.main.setFollowOffset(-this.followOffset.x, -this.followOffset.y);
  }

  /** Fires the alarm screen shake, unless the player has turned shake off. */
  private triggerAlarmShake(): void {
    if (!getSettings().screenShake) {
      return;
    }
    this.cameras.main.shake(JUICE.shake.durationMs, JUICE.shake.intensity);
  }

  /** True while the interact control is held: E on keyboard, A on the pad. */
  private isInteractHeld(pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    if (this.interactKey?.isDown) {
      return true;
    }
    return pad ? pad.A : false;
  }

  /**
   * True only on the frame the interact control goes down: a fresh press of E
   * or pad A, never a hold. Used for one-shot actions like the breaker so
   * holding the key cannot refire them. Must be called exactly once per frame
   * because it latches the keyboard edge and tracks the pad button's last state.
   */
  private isInteractJustPressed(pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    const keyEdge = this.interactKey ? Phaser.Input.Keyboard.JustDown(this.interactKey) : false;
    const aDown = pad ? pad.A : false;
    const padEdge = aDown && !this.padInteractWasDown;
    this.padInteractWasDown = aDown;
    return keyEdge || padEdge;
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
      this.triggerAlarmShake();
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

  /** Caught: a sharp DETAINED beat, then reset the run to the last checkpoint. */
  private detain(): void {
    recordDetain();
    this.detained = true;
    this.physics.pause();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Sudden-motion effects (flash + shake) obey the screen-shake setting.
    if (getSettings().screenShake) {
      this.cameras.main.flash(JUICE.detained.flashMs, 255, 59, 48);
    }
    this.triggerAlarmShake();

    const vignette = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, PALETTE_HEX.alarm, 0)
      .setScrollFactor(0)
      .setDepth(1999);
    this.tweens.add({
      targets: vignette,
      alpha: JUICE.detained.vignetteAlpha,
      duration: JUICE.detained.vignetteFadeMs,
      ease: 'Quad.easeOut',
    });

    this.add
      .rectangle(cx, cy, 360, 96, PALETTE_HEX.base, 0.82)
      .setScrollFactor(0)
      .setDepth(2000);
    this.add
      .text(cx, cy - 8, 'DETAINED', {
        fontFamily: FONTS.display,
        fontSize: '64px',
        color: PALETTE.alarm,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);
    this.add
      .text(cx, cy + 34, 'ESCORTED FROM SITE', {
        fontFamily: FONTS.mono,
        fontSize: '13px',
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);

    this.time.delayedCall(DETECTION.timing.detainedFlashMs, () => this.scene.restart());
  }

  /** The guard changed state: fire the alert sting and shake exactly on ALERT. */
  private onGuardStateCue(state: GuardState): void {
    if (state === 'alert') {
      this.audio.playAlertSting();
      this.triggerAlarmShake();
    }
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
    this.guardDebug.fillStyle(PALETTE_HEX.base, 0.5);
    this.guardDebug.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const colour =
      g.state === 'alert'
        ? PALETTE_HEX.alarm
        : g.state === 'curious'
          ? PALETTE_HEX.amber
          : PALETTE_HEX.text;
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
    kb.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,C,G,H,E,L');

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
