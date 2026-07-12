import Phaser from 'phaser';
import {
  AudioManager,
  setAudioGameplayPaused,
  setAudioMasterVolume,
  setAudioMuted,
} from '../audio/AudioManager';
import { zoneAt } from '../audio/zoneAt';
import { velocityFromDisplacement } from '../audio/audioPolicy';
import { ART } from '../config/art';
import { DETECTION } from '../config/detection';
import { HIJACK } from '../config/hijack';
import { INPUT } from '../config/input';
import { READABILITY } from '../config/readability';
import { NoiseRings } from '../systems/NoiseRings';
import { JUICE } from '../config/juice';
import { LIGHTING } from '../config/lighting';
import { MOVEMENT } from '../config/movement';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { THROW } from '../config/throw';
import { IMAGE_ASSETS, RENDER } from '../config/tiles';
import { Door } from '../entities/Door';
import { Guard, type GuardState, type PatrolNode } from '../entities/Guard';
import { Player } from '../entities/Player';
import { Staff, type StaffDef } from '../entities/Staff';
import type { KeyboardKeys } from '../input/KeyboardInput';
import { MovementController } from '../input/MovementController';
import { getActiveLevel, type LevelDef } from '../state/levels';
import { getSettings } from '../state/settings';
import {
  CameraSystem,
  type CamerasData,
  type ConsoleDef,
  type FeedInfo,
  type FreezeResult,
} from '../systems/CameraSystem';
import { AmbientParticles } from '../systems/AmbientParticles';
import { LightModel } from '../systems/LightModel';
import { LightingRenderer } from '../systems/LightingRenderer';
import type { PickupPoint, WallRect, ZoneRect } from '../world/BuildingMap';
import {
  getMission,
  raiseAlert,
  decayAlert,
  touchAlert,
  setCheckpoint,
  useHijackCharge,
  wearDisguise,
  blowDisguise,
} from '../state/mission';
import {
  getRunStats,
  recordAlertLevel,
  recordDetain,
  recordDisguiseBlown,
  recordDisguiseWorn,
  recordExfil,
  recordFeedFrozen,
  recordIngress,
  recordSpotted,
  type IngressRoute,
} from '../state/runStats';
import { ObjectiveSystem } from '../systems/ObjectiveSystem';
import { ThrowController } from '../systems/ThrowController';
import { DebugOverlay, type GuardHudInfo } from '../ui/DebugOverlay';
import { HintSystem } from '../systems/HintSystem';
import { BuildingMap } from '../world/BuildingMap';
import { WorldRenderer } from '../world/WorldRenderer';

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
  private guardId = '';
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
  private pauseKey?: Phaser.Input.Keyboard.Key;
  /** Last frame's pad A state, so the breaker sees a fresh press not a hold. */
  private padInteractWasDown = false;
  /** Last frame's pad Start state, so pause fires on a fresh press not a hold. */
  private padStartWasDown = false;
  /** The contract being played, pinned in init before any loading happens. */
  private level!: LevelDef;
  /** The security office console, if this level has one. */
  private consoleDef?: ConsoleDef;
  /** Names of zones flagged restricted in Tiled: no hi-vis excuse inside. */
  private restrictedZoneNames = new Set<string>();
  /** Names of zones flagged exterior in Tiled: the outdoors, for ingress. */
  private exteriorZoneNames = new Set<string>();
  /** Hi-vis pickups still on the floor, with their greybox marker objects. */
  private hivisPickups: { x: number; y: number; objects: Phaser.GameObjects.GameObject[] }[] = [];
  /** The screen-fixed HI-VIS: WORN / BLOWN tag, top right. */
  private disguiseTag!: Phaser.GameObjects.Text;
  /** True while the CCTV multiplexer overlay is open. */
  private consoleOpen = false;
  /**
   * Ignore pause presses until this time. Set when the console closes, because
   * the Escape that exits the multiplexer must not also open the pause badge.
   */
  private pauseSwallowUntil = 0;
  /** The doorway the player most recently stood in, naming the checkpoint. */
  private lastDoorId: string | null = null;
  /** The last camera ping, so the DETAINED banner can name the tip-off. */
  private lastCameraCue: { id: string; atMs: number } | null = null;
  /** Screen-fixed chevron pointing at an agitated off-screen guard. */
  private chevrons!: Phaser.GameObjects.Graphics;
  /** The visual ear: rings at guard footfalls within hearing range. */
  private noiseRings!: NoiseRings;
  /** First-run consultant notes at points of interest, once per profile. */
  private hintSystem!: HintSystem;
  /** Scene-clock ts of the last guard footfall ring. */
  private guardStepAt = 0;
  /** The guard's position last frame, to ring only while they move. */
  private prevGuardPos: { x: number; y: number } | null = null;
  /** The secondary camera rendering the live feed inside the multiplexer. */
  private feedCam?: Phaser.Cameras.Scene2D.Camera;

  constructor() {
    super('building');
  }

  /** Runs before preload on every start and restart: pin the active contract. */
  init(): void {
    this.level = getActiveLevel();
  }

  // Cache keys are namespaced by level id so two contracts never collide.
  private get mapKey(): string {
    return `map:${this.level.id}`;
  }
  private get guardDataKey(): string {
    return `guards:${this.level.id}`;
  }
  private get staffDataKey(): string {
    return `staff:${this.level.id}`;
  }
  private get cameraDataKey(): string {
    return `cameras:${this.level.id}`;
  }

  preload(): void {
    this.load.tilemapTiledJSON(this.mapKey, this.level.map);
    this.load.json(this.guardDataKey, this.level.guards);
    this.load.json(this.staffDataKey, this.level.staff);
    this.load.json(this.cameraDataKey, this.level.cameras);
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
    // The scene instance persists across restart(), so every per-life field
    // must reset here. A camera cue from the previous life must not be blamed
    // on the next banner, and a stale guard position must not ring a phantom
    // footstep on the first frame.
    this.lastCameraCue = null;
    this.lastDoorId = null;
    this.prevGuardPos = null;
    this.guardStepAt = 0;

    const map = new BuildingMap(this, this.mapKey);
    this.mapZones = map.zones;
    this.mapWalls = map.walls;
    this.world = new WorldRenderer(this, map);
    this.lightModel = new LightModel(map.zones, map.lights);

    // A detain restarts here: resume from the last checkpoint if there is one.
    // Checkpoints are always indoors, so a checkpoint start begins inside. A
    // checkpoint from a different contract never applies.
    const mission = getMission();
    const checkpoint = mission.levelId === this.level.id ? mission.checkpoint : null;
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
    const camerasData = this.cache.json.get(this.cameraDataKey) as CamerasData | undefined;
    this.cameraSystem = new CameraSystem(this, map.walls, camerasData);
    this.consoleOpen = false;
    this.feedCam = undefined;
    this.consoleDef = camerasData?.console;
    if (this.consoleDef) {
      this.drawConsoleMarker(this.consoleDef);
    }
    this.restrictedZoneNames = new Set(
      map.zones.filter((zone) => zone.restricted).map((zone) => zone.name)
    );
    this.exteriorZoneNames = new Set(
      map.zones.filter((zone) => zone.exterior).map((zone) => zone.name)
    );
    this.spawnHivisPickups(map);
    // Atmosphere: dust in the pool lights, steam and haze from the map data.
    // The scene owns the emitters; nothing needs a reference back.
    new AmbientParticles(this, map.lights, map.effects);

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
    // Screen-edge warning for an agitated guard outside the viewport.
    this.chevrons = this.add.graphics().setScrollFactor(0).setDepth(998);
    this.noiseRings = new NoiseRings(this);
    this.hintSystem = new HintSystem(this, this.level.id, this.level.hints ?? []);
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

    // The disguise tag, top right, screen fixed. Text states, never colour alone.
    this.disguiseTag = this.add
      .text(this.scale.width - 12, 12, '', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: PALETTE.amber,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.refreshDisguiseTag();

    // Lighting and audio. The renderer draws last each frame; audio arms its
    // autoplay unlock on the first input and makes no sound before that.
    this.lightingRenderer = new LightingRenderer(this);
    this.audio = new AudioManager();
    setAudioGameplayPaused(false);
    this.audio.init(this);
    // Apply the saved audio preferences to the shared mix. Safe before unlock:
    // the values are stored and take effect when the graph is first built.
    setAudioMasterVolume(getSettings().masterVolume);
    setAudioMuted(getSettings().muted);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.suspendForRestart());

    // Debug toggles, dev builds only: production players get no grid, guard
    // internals or lighting-off cheats. Edge-triggered keys so nothing stacks
    // up on scene.restart.
    if (import.meta.env.DEV) {
      this.gridKey = this.input.keyboard?.addKey('G');
      this.guardDebugKey = this.input.keyboard?.addKey('H');
      this.lightingKey = this.input.keyboard?.addKey('L');
    }
    this.interactKey = this.input.keyboard?.addKey('E');
    this.pauseKey = this.input.keyboard?.addKey('ESC');

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

    const gamepadPlugin = this.input.gamepad;
    const pad =
      gamepadPlugin && gamepadPlugin.total > 0 ? gamepadPlugin.getPad(0) : undefined;

    // Pause on Escape or the pad Start button. Read the edge every frame so the
    // held state never goes stale, but only act when actually in play. While
    // the console is open, Escape and B belong to the multiplexer instead, and
    // for a beat after it closes the same press must not reopen as pause.
    const wantsPause = this.pausePressed(pad) && this.time.now >= this.pauseSwallowUntil;
    if (wantsPause && !this.detained && !this.missionOver && !this.consoleOpen) {
      this.openPause();
      return;
    }

    if (this.detained || this.missionOver) {
      return; // frozen during the DETAINED flash or the handover to the report
    }

    const now = this.time.now;
    // Read the interact edge exactly once per frame (it latches key and pad state).
    const interactPressed = this.isInteractJustPressed(pad);
    // At the console the player stands still, but the world keeps moving: that
    // is the whole point of watching the feeds.
    const intent = this.consoleOpen
      ? this.controller.update(undefined, undefined)
      : this.controller.update(pad, this.keys);
    // Arcade Physics has already completed this frame's movement. Capture its
    // displacement before applyMotion writes the next requested velocity.
    const playerActualVelocity = velocityFromDisplacement(
      this.player.body.deltaX(),
      this.player.body.deltaY(),
      delta
    );
    this.player.applyMotion(intent, delta);
    this.updateLookAhead(intent.direction);

    this.updateAlertLevel(now);
    // Lockdown slams the console session shut mid-use.
    if (this.consoleOpen && getMission().alertLevel >= HIJACK.lockoutAlertLevel) {
      this.closeConsole('denied');
    }
    this.updateDoorsAndStaff(now, delta);
    this.trackIngressAndCheckpoint();
    this.hearFootsteps();

    // Shared occluder set for the guard, cameras and audio this frame.
    const closedDoors = this.doors.filter((d) => !d.isOpen).map((d) => d.rect);

    let guardActualVelocity = { x: 0, y: 0 };
    if (this.guard) {
      // Capture the completed physics step before Guard.update writes the next
      // requested velocity, matching the player footstep rule.
      guardActualVelocity = velocityFromDisplacement(
        this.guard.displacementX,
        this.guard.displacementY,
        delta
      );
      // The guard's own sightline lights where it looks; darkness elsewhere is
      // cover, so sample the light at the player and feed it into perception.
      this.lightModel.setGuardTorch(this.guard.x, this.guard.y, this.guard.facingAngle);
      const lightAtPlayer = this.lightModel.computeLightAt(this.player.x, this.player.y);
      const tick = this.guard.update(now, delta, {
        playerX: this.player.x,
        playerY: this.player.y,
        playerSpeed: intent.speed,
        closedDoors,
        lightLevel: lightAtPlayer,
        disguised: this.isDisguisePlausible(),
      });
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
      this.consoleOpen ? false : interactPressed
    );
    for (const p of camTick.investigatePoints) {
      this.guard?.investigatePoint(p.x, p.y);
      this.lastCameraCue = { id: p.id, atMs: now };
      this.offerSecurityCue('camera-ping', now, p.x, p.y, closedDoors);
    }
    if (camTick.raisedAlert) {
      const level = raiseAlert(now);
      recordAlertLevel(level);
      this.triggerAlarmShake();
      const alarm = camTick.alarmPoints[0];
      if (alarm) this.offerSecurityCue('camera-alarm', now, alarm.x, alarm.y, closedDoors);
    }

    const objTick = this.objectives.update({
      now,
      dtMs: delta,
      playerX: this.player.x,
      playerY: this.player.y,
      interactHeld: this.consoleOpen ? false : this.isInteractHeld(pad),
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
        label: 'PLANT SITE',
      });
    }
    if (objTick.exfilNow) {
      this.missionOver = true;
      recordExfil();
      this.scene.start('report');
      return;
    }
    // The objective prompt wins, then the console, then a pickup, then the
    // breaker. The multiplexer overlay owns the screen while it is open.
    const consoleLine = this.updateConsole(interactPressed);
    const pickupLine = this.consoleOpen ? null : this.updateHivisPickups(interactPressed);
    this.promptText.setText(
      this.consoleOpen ? '' : (objTick.prompt ?? consoleLine ?? pickupLine ?? camTick.prompt ?? '')
    );
    this.promptText.setScale(getSettings().hudScale);
    this.disguiseTag.setScale(getSettings().hudScale);

    if (this.consoleOpen) {
      // Clicks made on the multiplexer belong to the multiplexer: drop them,
      // or the first frame after it closes would throw a bolt at the cursor.
      this.throwController.discardQueued();
    } else {
      this.throwController.update(this, delta, this.player.x, this.player.y, pad);
    }

    this.audio.update({
      nowMs: now,
      player: {
        x: this.player.x,
        y: this.player.y,
        velocityX: playerActualVelocity.x,
        velocityY: playerActualVelocity.y,
      },
      guard: this.guard
        ? {
            id: this.guardId,
            x: this.guard.x,
            y: this.guard.y,
            velocityX: guardActualVelocity.x,
            velocityY: guardActualVelocity.y,
            state: this.guard.state,
          }
        : null,
      playerSpeed: intent.speed,
      zones: this.mapZones,
      walls: this.mapWalls,
      closedDoorRects: closedDoors,
      alertLevel: getMission().alertLevel,
      venueAudio: this.level.audio,
    });

    this.drawGuardChevron();
    this.updateGuardNoiseRings(now);
    this.hintSystem.update(now, this.player.x, this.player.y);

    this.overlay.update(this.player, intent, {
      bolts: this.throwController.remaining,
      site: SITE_LABELS[getMission().alertLevel] ?? 'CALM',
      loops: this.cameraSystem
        .feedInfos(now)
        .filter((f) => f.frozenRemainingMs > 0)
        .map((f) => ({ id: f.id, secondsLeft: Math.ceil(f.frozenRemainingMs / 1000) })),
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

  /** True on the frame Escape or the pad Start button is freshly pressed. */
  private pausePressed(pad: Phaser.Input.Gamepad.Gamepad | undefined): boolean {
    const escEdge = this.pauseKey ? Phaser.Input.Keyboard.JustDown(this.pauseKey) : false;
    const startDown = pad?.buttons?.[9]?.pressed ?? false;
    const startEdge = startDown && !this.padStartWasDown;
    this.padStartWasDown = startDown;
    return escEdge || startEdge;
  }

  /** Freezes the building and opens the lanyard pause badge over the top. */
  private openPause(): void {
    setAudioGameplayPaused(true);
    this.scene.launch('pause');
    this.scene.pause();
  }

  /**
   * The security console prompt and interact. Returns the HUD line, or null
   * when out of range or the console is already open. Lockdown refuses
   * service; the multiplexer overlay opens on a fresh interact press.
   */
  private updateConsole(interactPressed: boolean): string | null {
    const def = this.consoleDef;
    if (!def || this.consoleOpen) {
      return null;
    }
    const inRange =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, def.x, def.y) <=
      HIJACK.console.interactRangePx;
    if (!inRange) {
      return null;
    }
    if (getMission().alertLevel >= HIJACK.lockoutAlertLevel) {
      return 'CONSOLE LOCKED: SITE ON LOCKDOWN';
    }
    if (interactPressed) {
      this.openConsole();
      return null;
    }
    return '[E] SECURITY CONSOLE';
  }

  private openConsole(): void {
    this.consoleOpen = true;
    this.audio.playConsoleCue('open');
    this.scene.launch('hijack');
  }

  /** Closes the multiplexer, optionally with a cue ('denied' on lockdown). */
  closeConsole(cue: 'denied' | null = null): void {
    if (!this.consoleOpen) {
      return;
    }
    this.consoleOpen = false;
    // The press that closed the console (Escape or B) is still fresh; give it
    // time to fully release so it cannot double as a pause press.
    this.pauseSwallowUntil = this.time.now + INPUT.swallowWindowMs;
    if (cue) {
      this.audio.playConsoleCue(cue);
    }
    this.scene.stop('hijack');
    this.destroyFeedView();
  }

  /** Feed list plus remaining loop charges, for the multiplexer UI. */
  hijackFeeds(): { feeds: FeedInfo[]; chargesRemaining: number } {
    return {
      feeds: this.cameraSystem.feedInfos(this.time.now),
      chargesRemaining: Math.max(0, HIJACK.charges - getMission().hijackChargesUsed),
    };
  }

  /** Spends a charge to loop the named feed, with cues for every outcome. */
  hijackFreeze(id: string): FreezeResult | 'no-charges' {
    if (HIJACK.charges - getMission().hijackChargesUsed <= 0) {
      this.audio.playConsoleCue('denied');
      return 'no-charges';
    }
    const result = this.cameraSystem.freezeCamera(id, this.time.now);
    if (result === 'frozen') {
      useHijackCharge();
      recordFeedFrozen(id);
      this.audio.playConsoleCue('freeze');
    } else {
      this.audio.playConsoleCue('denied');
    }
    return result;
  }

  /** Points the live feed at the named camera, creating the view on demand. */
  hijackShowFeed(cameraId: string): void {
    const feed = this.cameraSystem
      .feedInfos(this.time.now)
      .find((f) => f.id === cameraId);
    if (!feed) {
      return;
    }
    this.ensureFeedView();
    this.feedCam?.centerOn(feed.x, feed.y);
  }

  /** The multiplexer's exit path (B or Escape on the console). */
  hijackClose(): void {
    this.closeConsole();
  }

  /**
   * The feed view is a second scene camera with a small viewport, scrolled to
   * whichever CCTV the multiplexer is showing. It skips the screen-fixed veil
   * and HUD: greybox feeds show the unlit world, dressed in Phase 10.
   */
  private ensureFeedView(): void {
    if (this.feedCam) {
      return;
    }
    const { x, y, width, height } = HIJACK.feed;
    this.feedCam = this.cameras.add(x, y, width, height);
    this.feedCam.setBounds(
      0,
      0,
      this.physics.world.bounds.width,
      this.physics.world.bounds.height
    );
    this.feedCam.ignore([
      this.lightingRenderer.veil,
      this.promptText,
      this.disguiseTag,
      ...this.overlay.screenObjects,
      this.guardDebug,
      this.chevrons,
      this.noiseRings.gameObject,
      this.hintSystem.gameObject,
    ]);
  }

  private destroyFeedView(): void {
    if (this.feedCam) {
      this.cameras.remove(this.feedCam);
      this.feedCam = undefined;
    }
  }

  /** The dressed console: a desk unit, an amber monitor and a patient pip. */
  private drawConsoleMarker(def: ConsoleDef): void {
    // A real desk under the monitor, from the existing Kenney prop set.
    this.add.image(def.x, def.y + 4, 'prop_desk_small').setScale(RENDER.propScale).setDepth(15);
    // The monitor: dark slab, amber screen and a soft standby glow.
    this.add
      .rectangle(def.x, def.y - 6, 22, 14, 0x2a2f38)
      .setStrokeStyle(1.5, PALETTE_HEX.amber, 0.9)
      .setDepth(16);
    this.add.circle(def.x, def.y - 6, 15, PALETTE_HEX.amber, ART.console.screenGlowAlpha).setDepth(16);
    this.add.rectangle(def.x, def.y - 7, 16, 8, PALETTE_HEX.amber, 0.45).setDepth(17);
    // A slow blinking status pip: gentle, nothing like a strobe.
    const pip = this.add.circle(def.x + 8, def.y - 11, 1.5, PALETTE_HEX.amber, 1).setDepth(18);
    this.tweens.add({
      targets: pip,
      alpha: 0.15,
      duration: ART.console.pipBlinkMs,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * True while the hi-vis actually fools anyone: worn, not blown, the site
   * calm, and the player somewhere a contractor plausibly belongs. The guard
   * adds the close-range override on top.
   */
  private isDisguisePlausible(): boolean {
    const disguise = getMission().disguise;
    if (!disguise.worn || disguise.blown || getMission().alertLevel > 0) {
      return false;
    }
    const zone = zoneAt(this.mapZones, this.player.x, this.player.y);
    return !(zone && this.restrictedZoneNames.has(zone));
  }

  /**
   * Places hi-vis pickups from the map's pickups layer. Vests exist only
   * where a level authors them; the warehouse is the disguise's home.
   */
  private spawnHivisPickups(map: BuildingMap): void {
    this.hivisPickups = [];
    if (getMission().disguise.worn) {
      return; // already wearing it; a checkpoint restart must not respawn one
    }
    const pickups: PickupPoint[] = map.pickups.filter((p) => p.kind === 'hivis');
    for (const p of pickups) {
      this.hivisPickups.push(this.drawHivisMarker(p.x, p.y));
    }
  }

  /** The greybox vest: an amber tabard with a grey reflective band. */
  private drawHivisMarker(
    x: number,
    y: number
  ): { x: number; y: number; objects: Phaser.GameObjects.GameObject[] } {
    const body = this.add.rectangle(x, y, 14, 16, PALETTE_HEX.amber, 0.9).setDepth(15);
    const band = this.add.rectangle(x, y, 14, 3, 0xc7cdd4, 1).setDepth(16);
    return { x, y, objects: [body, band] };
  }

  /** Pickup prompt and interact: taking the vest puts it on for the run. */
  private updateHivisPickups(interactPressed: boolean): string | null {
    for (let i = 0; i < this.hivisPickups.length; i += 1) {
      const pickup = this.hivisPickups[i];
      const inRange =
        Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y) <= 48;
      if (!inRange) {
        continue;
      }
      if (interactPressed) {
        // One vest is all anyone needs: taking it clears every other pickup,
        // so a blown disguise can never dangle the false hope of a fresh one.
        for (const remaining of this.hivisPickups) {
          for (const obj of remaining.objects) {
            obj.destroy();
          }
        }
        this.hivisPickups = [];
        wearDisguise();
        recordDisguiseWorn();
        this.refreshDisguiseTag();
        return null;
      }
      return '[E] TAKE HI-VIS VEST';
    }
    return null;
  }

  /** Repaints the top-right tag and the on-sprite vest cast from mission state. */
  private refreshDisguiseTag(): void {
    const disguise = getMission().disguise;
    // The vest reads on the sprite too: an amber cast while it is worn. The
    // text tag stays the authoritative signal, per the never-colour-alone rule.
    if (disguise.worn) {
      this.player.sprite.setTint(ART.hivis.tint);
    } else {
      this.player.sprite.clearTint();
    }
    if (!disguise.worn) {
      this.disguiseTag.setText('');
    } else if (disguise.blown) {
      this.disguiseTag.setText('HI-VIS: BLOWN').setColor(PALETTE.text);
    } else {
      this.disguiseTag.setText('HI-VIS: WORN').setColor(PALETTE.amber);
    }
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

  /**
   * Records which entrance the player uses and sets the first checkpoint.
   * Driven entirely by zones flagged exterior in the map data, so every level
   * defines its own outdoors; nothing about the geometry lives in code.
   */
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
    // Doorways are hysteresis: while the player stands in any door rect, the
    // outside flag and the checkpoint hold their state. This stops an EXIT
    // from reading as a fresh ingress (some maps' zones touch the door band),
    // and keeps the checkpoint from ever being saved inside a door, where a
    // detain restart would respawn the player embedded in a closed barrier.
    for (const door of this.doors) {
      if (door.contains(this.player.x, this.player.y)) {
        // Remember which doorway this was: the first interior checkpoint set
        // just after clearing it takes this door's name for the banner.
        this.lastDoorId = door.id;
        return;
      }
    }
    // Wall bands sit outside every zone rectangle, so a null zone also keeps
    // the last known side of the threshold.
    const zone = zoneAt(this.mapZones, this.player.x, this.player.y);
    if (!zone) {
      return;
    }
    const outside = this.exteriorZoneNames.has(zone);
    // First checkpoint: the first time the player stands in an interior zone,
    // guaranteed clear of every doorway by the hold above.
    if (this.playerWasOutside && !outside && !getMission().checkpoint) {
      setCheckpoint({
        x: this.player.x,
        y: this.player.y,
        bolts: this.throwController.remaining,
        label: this.lastDoorId ? `${this.lastDoorId.toUpperCase()} DOOR` : 'SIGN-IN POINT',
      });
    }
    this.playerWasOutside = outside;
  }

  private spawnDoors(map: BuildingMap): void {
    this.doors = map.doors.map((rect) => new Door(this, rect));
  }

  private spawnStaff(): void {
    const data = this.cache.json.get(this.staffDataKey) as StaffData | undefined;
    for (const def of data?.staff ?? []) {
      const member = new Staff(this, def);
      this.staff.push(member);
      // Staff collide with walls like everyone else, so a route authored
      // through a wall strands visibly in playtesting instead of ghosting.
      this.physics.add.collider(member.sprite, this.walls);
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
  private updateDoorsAndStaff(now: number, dtMs: number): void {
    const lockdown = getMission().alertLevel >= 2;
    for (const member of this.staff) {
      member.update(now, dtMs);
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
      door.update(now, lockdown, this.player.x, this.player.y);
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
    const data = this.cache.json.get(this.guardDataKey) as GuardsData | undefined;
    const first = data?.guards?.[0];
    if (!first || first.route.length === 0) {
      return;
    }
    this.baseRoute = first.route;
    this.cautiousExtra = first.cautiousExtra ?? [];
    this.guardId = first.id;
    this.guard = new Guard(this, first.route, map.walls, (state) => this.onGuardStateCue(state));
    this.physics.add.collider(this.guard.sprite, this.walls);
  }

  /** Caught: a sharp DETAINED beat, then reset the run to the last checkpoint. */
  private detain(): void {
    this.closeConsole();
    recordDetain();
    this.detained = true;
    this.physics.pause();
    this.chevrons.clear();

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
      .rectangle(cx, cy + 10, 560, 168, PALETTE_HEX.base, 0.82)
      .setScrollFactor(0)
      .setDepth(2000);
    this.add
      .text(cx, cy - 24, 'DETAINED', {
        fontFamily: FONTS.display,
        fontSize: '64px',
        color: PALETTE.alarm,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001);

    // Why, and where the run picks up: the two questions the blind playtest
    // could not answer. A camera ping this recent gets named as the tip-off.
    const cue = this.lastCameraCue;
    const tipped =
      cue !== null && this.time.now - cue.atMs <= READABILITY.detain.cameraTipWindowMs;
    const cause = tipped
      ? `CAUGHT BY PATROL, TIPPED OFF BY CAM ${cue.id.toUpperCase()}`
      : 'CAUGHT BY SECURITY PATROL';
    const resumeAt = getMission().checkpoint?.label ?? 'THE VAN';
    const lines = ['ESCORTED FROM SITE', cause, `RESUMING AT: ${resumeAt}`];
    lines.forEach((line, i) => {
      this.add
        .text(cx, cy + 22 + i * 20, line, {
          fontFamily: FONTS.mono,
          fontSize: '13px',
          color: PALETTE.text,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2001);
    });

    this.time.delayedCall(READABILITY.detain.bannerMs, () => this.scene.restart());
  }

  /**
   * Rings guard footfalls the player can hear. Cadence and range live in
   * config/readability.ts; rings only spawn while the guard actually moves,
   * so a paused investigation goes quiet exactly like its audio does.
   */
  private updateGuardNoiseRings(now: number): void {
    if (this.guard) {
      const moved =
        this.prevGuardPos !== null &&
        (Math.abs(this.guard.x - this.prevGuardPos.x) > 0.5 ||
          Math.abs(this.guard.y - this.prevGuardPos.y) > 0.5);
      this.prevGuardPos = { x: this.guard.x, y: this.guard.y };
      const inRange =
        Phaser.Math.Distance.Between(this.player.x, this.player.y, this.guard.x, this.guard.y) <=
        READABILITY.noiseRings.rangePx;
      if (moved && inRange && now - this.guardStepAt >= READABILITY.noiseRings.stepIntervalMs) {
        this.guardStepAt = now;
        this.noiseRings.spawn(this.guard.x, this.guard.y, now);
      }
    }
    this.noiseRings.update(now);
  }

  /**
   * Points a screen-edge chevron at the guard when they are worked up but out
   * of view: a hollow amber outline while curious, a doubled solid red chevron
   * once they are fully ALERT (chasing, which is trouble, so red is honest).
   * Shape and colour change together, per the never-colour-alone rule, the
   * same reason the vision cones pair colour with an edge style. A calm
   * patrol draws nothing, scouting still means walking over and looking.
   */
  private drawGuardChevron(): void {
    this.chevrons.clear();
    const guard = this.guard;
    if (!guard || guard.state === 'patrol') {
      return;
    }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, guard.x, guard.y);
    if (dist > READABILITY.chevron.rangePx) {
      return;
    }
    const cam = this.cameras.main;
    const sx = guard.x - cam.scrollX;
    const sy = guard.y - cam.scrollY;
    const w = this.scale.width;
    const h = this.scale.height;
    if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) {
      return; // visible: the guard themself is the warning
    }

    // Clamp the direction ray from the screen centre onto the inset border.
    const { edgeInsetPx, sizePx } = READABILITY.chevron;
    const dx = sx - w / 2;
    const dy = sy - h / 2;
    const scale = Math.min(
      (w / 2 - edgeInsetPx) / Math.max(Math.abs(dx), 0.001),
      (h / 2 - edgeInsetPx) / Math.max(Math.abs(dy), 0.001),
      1
    );
    const px = w / 2 + dx * scale;
    const py = h / 2 + dy * scale;
    const angle = Math.atan2(dy, dx);
    const triangle = (cx2: number, cy2: number) => {
      const point = (a: number) => ({
        x: cx2 + Math.cos(a) * sizePx,
        y: cy2 + Math.sin(a) * sizePx,
      });
      return [point(angle), point(angle + 2.5), point(angle - 2.5)] as const;
    };

    if (guard.state === 'alert') {
      // Chasing: two solid red arrowheads stacked along the direction.
      this.chevrons.fillStyle(PALETTE_HEX.alarm, 0.95);
      const back = triangle(px - Math.cos(angle) * sizePx * 1.4, py - Math.sin(angle) * sizePx * 1.4);
      const front = triangle(px, py);
      this.chevrons.fillTriangle(front[0].x, front[0].y, front[1].x, front[1].y, front[2].x, front[2].y);
      this.chevrons.fillTriangle(back[0].x, back[0].y, back[1].x, back[1].y, back[2].x, back[2].y);
    } else {
      // Curious: a single hollow amber outline.
      const [tip, left, right] = triangle(px, py);
      this.chevrons.lineStyle(2, PALETTE_HEX.amber, 0.95);
      this.chevrons.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }
  }

  /** The guard changed state: offer one transition cue and shake exactly on ALERT. */
  private onGuardStateCue(state: GuardState): void {
    if (state === 'curious' && this.guard) {
      this.offerSecurityCue('guard-curious', this.time.now, this.guard.x, this.guard.y);
    }
    if (state === 'alert') {
      // A guard going full ALERT on a disguised player burns the disguise for
      // the rest of the run: security now knows the vest.
      const disguise = getMission().disguise;
      if (disguise.worn && !disguise.blown) {
        blowDisguise();
        recordDisguiseBlown();
        this.refreshDisguiseTag();
      }
      if (this.guard) {
        this.offerSecurityCue('guard-alert', this.time.now, this.guard.x, this.guard.y);
      }
      this.triggerAlarmShake();
    }
  }

  private offerSecurityCue(
    cue: 'guard-curious' | 'guard-alert' | 'camera-ping' | 'camera-alarm',
    now: number,
    sourceX: number,
    sourceY: number,
    closedDoors = this.doors.filter((door) => !door.isOpen).map((door) => door.rect)
  ): void {
    this.audio.offerSecurityCue(cue, now, {
      sourceX,
      sourceY,
      playerX: this.player.x,
      playerY: this.player.y,
      walls: this.mapWalls,
      closedDoors,
    });
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
