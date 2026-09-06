import Phaser from 'phaser';
import {
  AudioManager,
  setAudioGameplayPaused,
  setAudioMasterVolume,
  setAudioMuted,
} from '../audio/AudioManager';
import { zoneAt } from '../audio/zoneAt';
import { velocityFromDisplacement } from '../audio/audioPolicy';
import { BadgeAttemptEdges } from '../audio/foleyPolicy';
import { ART } from '../config/art';
import { AUDIO } from '../config/audio';
import { CAMERAS } from '../config/cameras';
import { DETECTION } from '../config/detection';
import { HIJACK } from '../config/hijack';
import { HUD } from '../config/hud';
import { INPUT } from '../config/input';
import { READABILITY } from '../config/readability';
import { NoiseRings } from '../systems/NoiseRings';
import { JUICE } from '../config/juice';
import { LIGHTING } from '../config/lighting';
import { MOVEMENT } from '../config/movement';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { THROW } from '../config/throw';
import { IMAGE_ASSETS, RENDER } from '../config/tiles';
import { NOISE_RING_TINT } from '../config/zones';
import { Door } from '../entities/Door';
import type { Guard, GuardState } from '../entities/Guard';
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
import { FeedTreatment } from '../systems/FeedTreatment';
import { GuardAwareness } from '../systems/GuardAwareness';
import { GuardRoster, type GuardDef } from '../systems/GuardRoster';
import { LightModel } from '../systems/LightModel';
import { LightingRenderer } from '../systems/LightingRenderer';
import { NavGrid } from '../systems/NavGrid';
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
import { AlertBanner } from '../ui/AlertBanner';
import { FieldHud, type HudFrame } from '../ui/FieldHud';
import { ScreenEdgeMarkers } from '../ui/ScreenEdgeMarkers';
import { fadeIn, fadeOutThen, fadeToScene } from '../ui/transitions';
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
  guards: GuardDef[];
}
interface StaffData {
  staff: StaffDef[];
}

/**
 * The gameplay scene. The player at the van, every guard in the level's
 * guards.json on their rounds, staff on theirs, and three gated ways in: a
 * badge gate you tailgate, a timed smokers' door and a timed loading-dock
 * shutter. The player can throw bolts to distract guards, and running
 * footsteps make noise the guards hear.
 */
export class BuildingScene extends Phaser.Scene {
  private player!: Player;
  private controller!: MovementController;
  private hud!: FieldHud;
  private world!: WorldRenderer;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private keys?: KeyboardKeys;
  /** Every guard on site. Phase 21: as many as the data lists, not one. */
  private guards!: GuardRoster;
  /** What each guard is thinking, drawn over their head. */
  private awareness!: GuardAwareness;
  private doors: Door[] = [];
  private staff: Staff[] = [];
  private throwController!: ThrowController;
  private objectives!: ObjectiveSystem;
  private cameraSystem!: CameraSystem;
  private lightModel!: LightModel;
  private lightingRenderer!: LightingRenderer;
  private feedTreatment!: FeedTreatment;
  private audio!: AudioManager;
  private mapZones: ZoneRect[] = [];
  private mapWalls: WallRect[] = [];
  /** The walkable map guards path across. Rebuilt with the level on every restart. */
  private navGrid!: NavGrid;
  private followOffset = new Phaser.Math.Vector2(0, 0);
  private promptText!: Phaser.GameObjects.Text;
  private guardDebug!: Phaser.GameObjects.Graphics;
  private guardDebugOn = false;
  private lightingHidden = false;
  private detained = false;
  private missionOver = false;
  private appliedAlertLevel = -1;
  private playerWasOutside = true;
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
  /** True while the CCTV multiplexer overlay is open. */
  private consoleOpen = false;
  /**
   * Ignore pause presses until this time. Set when the console closes, because
   * the Escape that exits the multiplexer must not also open the pause badge.
   */
  private pauseSwallowUntil = 0;
  private readonly doorAudioState = new Map<string, boolean>();
  private readonly badgeAttemptEdges = new BadgeAttemptEdges();
  /** The doorway the player most recently stood in, naming the checkpoint. */
  private lastDoorId: string | null = null;
  /** The last camera ping, so the DETAINED banner can name the tip-off. */
  private lastCameraCue: { id: string; atMs: number } | null = null;
  /** Screen-border markers: agitated off-screen guards and the objective. */
  private edgeMarkers!: ScreenEdgeMarkers;
  /** The site-alert banner that announces a change of alert level. */
  private alertBanner!: AlertBanner;
  /** The visual ear: rings at guard footfalls within hearing range. */
  private noiseRings!: NoiseRings;
  /** The player's own steady noise ring. */
  private playerRing!: Phaser.GameObjects.Graphics;
  /** Footstep cadence for the player's noise ripples, ms accumulated. */
  private playerStepMs = 0;
  /** First-run consultant notes at points of interest, once per profile. */
  private hintSystem!: HintSystem;
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
    // The CCTV prop art. It lives with the camera tuning rather than in the
    // tile manifest because Camera.ts owns it, not the map's props layer.
    this.load.image(CAMERAS.art.housingKey, CAMERAS.art.housingPath);
    this.load.image(CAMERAS.art.lensKey, CAMERAS.art.lensPath);
  }

  create(): void {
    this.detained = false;
    this.missionOver = false;
    this.appliedAlertLevel = -1;
    this.doors = [];
    this.staff = [];
    this.followOffset.set(0, 0);
    // The scene instance persists across restart(), so every per-life field
    // must reset here. A camera cue from the previous life must not be blamed
    // on the next banner.
    this.lastCameraCue = null;
    this.lastDoorId = null;
    this.playerStepMs = 0;

    const map = new BuildingMap(this, this.mapKey);
    this.mapZones = map.zones;
    this.mapWalls = map.walls;
    // Phase 20 playtest fix: guards need a real map to walk, not a straight line
    // at whatever they are chasing. Built once here from the wall data, before
    // anything that navigates exists.
    this.navGrid = new NavGrid(map.widthInPixels, map.heightInPixels, map.walls);
    this.world = new WorldRenderer(this, map, this.level.id);
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
    this.spawnGuards(map);
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
    this.hud = new FieldHud(this);
    this.guardDebug = this.add.graphics().setDepth(50);
    this.playerRing = this.add.graphics().setDepth(30);
    this.edgeMarkers = new ScreenEdgeMarkers(this);
    this.alertBanner = new AlertBanner(this);
    this.noiseRings = new NoiseRings(this);
    this.awareness = new GuardAwareness(this);
    this.hintSystem = new HintSystem(this, this.level.id, this.level.hints ?? []);
    this.throwController = new ThrowController(
      this,
      (x, y) => this.onNoise(x, y),
      checkpoint?.bolts,
      () => this.audio.playFoley('bolt-throw', 0.55),
      (x, y) => this.playWorldFoley('metal-impact', x, y, 600)
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
    this.refreshDisguiseCast();

    // Lighting and audio. The renderer draws last each frame; audio arms its
    // autoplay unlock on the first input and makes no sound before that.
    this.lightingRenderer = new LightingRenderer(this);
    // The security-feed look over the finished picture: cool cast, faint static
    // and an alert-coloured vignette, all above the veil and below the HUD.
    this.feedTreatment = new FeedTreatment(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.feedTreatment.destroy());
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
        __guards: GuardRoster;
        __fillMultiplierAt: (x: number, y: number) => number;
      };
      dev.__lightModel = this.lightModel;
      dev.__cameras = this.cameraSystem;
      dev.__audio = this.audio;
      dev.__guards = this.guards;
      dev.__fillMultiplierAt = (x, y) =>
        Phaser.Math.Linear(LIGHTING.concealmentFloor, 1, this.lightModel.computeLightAt(x, y));
    }

    // Every arrival on site, first start or detain restart, comes up from black.
    fadeIn(this);
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

    // Shared occluder set for the guards, cameras and audio this frame.
    const closedDoors = this.doors.filter((d) => !d.isOpen).map((d) => d.rect);

    // Every guard's sightline lights where it looks; darkness elsewhere is
    // cover, so sample the light at the player and feed it into perception.
    // The nearest guard's displacement is captured before Guard.update writes
    // the next requested velocity, matching the player footstep rule.
    const nearest = this.guards.nearestTo(this.player.x, this.player.y);
    const nearestActualVelocity = nearest
      ? velocityFromDisplacement(nearest.displacementX, nearest.displacementY, delta)
      : { x: 0, y: 0 };
    this.lightModel.setGuardTorches(this.guards.torches());
    const lightAtPlayer = this.lightModel.computeLightAt(this.player.x, this.player.y);
    const disguised = this.isDisguisePlausible();
    const rosterTick = this.guards.update(now, delta, () => ({
      playerX: this.player.x,
      playerY: this.player.y,
      playerSpeed: intent.speed,
      closedDoors,
      lightLevel: lightAtPlayer,
      disguised,
    }));
    if (rosterTick.spottedNow) {
      recordSpotted();
    }
    if (rosterTick.caughtBy) {
      this.detain();
      return;
    }
    this.witnessTailgate();
    this.updateRadio(now);

    // Cameras run after the guards so a curious ping targets their fresh state
    // and a camera-driven alert lands in the same escalation slot as the radio.
    const camTick = this.cameraSystem.update(
      now,
      delta,
      this.player.x,
      this.player.y,
      closedDoors,
      this.consoleOpen ? false : interactPressed
    );
    for (const p of camTick.investigatePoints) {
      // The nearest unit answers the camera's call; the rest keep their rounds.
      this.guards.dispatchNearest(p.investigateX, p.investigateY);
      this.lastCameraCue = { id: p.id, atMs: now };
      this.offerSecurityCue('camera-ping', now, p.sourceX, p.sourceY, closedDoors);
    }
    if (camTick.raisedAlert) {
      const level = raiseAlert(now);
      recordAlertLevel(level);
      this.triggerAlarmShake();
      const alarm = camTick.alarmPoints[0];
      if (alarm) this.offerSecurityCue('camera-alarm', now, alarm.x, alarm.y, closedDoors);
    }

    if (camTick.breakerPoint && camTick.breakerTrippedNow) {
      this.playWorldFoley('breaker-trip', camTick.breakerPoint.x, camTick.breakerPoint.y, 600);
    }
    if (camTick.breakerPoint && camTick.cameraPowerReturnedNow) {
      this.playWorldFoley('camera-return', camTick.breakerPoint.x, camTick.breakerPoint.y, 600);
    }

    const objTick = this.objectives.update({
      now,
      dtMs: delta,
      playerX: this.player.x,
      playerY: this.player.y,
      interactHeld: this.consoleOpen ? false : this.isInteractHeld(pad),
      playerMoving: intent.speed !== 'idle',
      seenByGuard: this.guards.anyCanSeePlayer(),
      bumped: this.isBumped(),
    });
    if (objTick.plantedNow) {
      this.playWorldFoley('plant-complete', this.player.x, this.player.y, 500);
      // Second checkpoint: immediately after planting the device.
      setCheckpoint({
        x: this.player.x,
        y: this.player.y,
        bolts: this.throwController.remaining,
        label: 'PLANT SITE',
      });
    }
    if (objTick.photographedNow) {
      this.audio.playPhotographCue();
    }
    if (objTick.exfilNow) {
      this.missionOver = true;
      recordExfil();
      fadeToScene(this, 'report');
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
      // The audio follows whichever guard is nearest: their footsteps through
      // the walls and their radio are the ones the player can actually hear.
      guard: nearest
        ? {
            id: nearest.id,
            x: nearest.x,
            y: nearest.y,
            velocityX: nearestActualVelocity.x,
            velocityY: nearestActualVelocity.y,
            state: nearest.state,
          }
        : null,
      playerSpeed: intent.speed,
      zones: this.mapZones,
      walls: this.mapWalls,
      closedDoorRects: closedDoors,
      alertLevel: getMission().alertLevel,
      venueAudio: this.level.audio,
    });

    this.edgeMarkers.update(
      this.cameras.main,
      this.scale.width,
      this.scale.height,
      this.player.x,
      this.player.y,
      this.guards.guards,
      this.objectives.currentTarget()
    );
    this.updateNoiseRings(now, delta, intent.speed, playerActualVelocity);
    this.awareness.update(now, this.guards.guards, (guard) => this.radioProgress(guard, now));
    this.hintSystem.update(now, this.player.x, this.player.y);

    this.hud.update(this.buildHudFrame(now, intent.speed, lightAtPlayer, nearest));
    this.drawGuardDebug();

    // Lighting draws last so it reflects this frame's final positions, then the
    // feed treatment tints the finished picture and carries the alert level.
    this.lightingRenderer.update(
      this.cameras.main,
      this.player,
      this.guards.guards,
      this.lightModel.sources
    );
    this.feedTreatment.update(now, delta, getMission().alertLevel);
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
      // Tell the player the lock is temporary. Lockdown stands down once the
      // site has been quiet for a while (DETECTION.alert.level2DecayMs), and
      // without saying so the console reads as permanently broken.
      return 'CONSOLE LOCKED: SITE ON LOCKDOWN. STAY OUT OF SIGHT AND IT WILL STAND DOWN.';
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
   * and HUD: a camera shows the room, not the consultant's readouts.
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
      ...this.feedTreatment.screenObjects,
      this.promptText,
      ...this.hud.screenObjects,
      ...this.alertBanner.screenObjects,
      this.guardDebug,
      this.edgeMarkers.gameObject,
      this.noiseRings.gameObject,
      this.playerRing,
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
        this.refreshDisguiseCast();
        return null;
      }
      return '[E] TAKE HI-VIS VEST';
    }
    return null;
  }

  /**
   * The vest reads on the sprite: an amber cast while it is worn. The HUD's
   * HI-VIS line stays the authoritative signal, per the never-colour-alone rule.
   */
  private refreshDisguiseCast(): void {
    if (getMission().disguise.worn) {
      this.player.sprite.setTint(ART.hivis.tint);
    } else {
      this.player.sprite.clearTint();
    }
  }

  /** True if a staff member or a guard is pressed up against the player. */
  private isBumped(): boolean {
    if (this.guards.anyWithin(this.player.x, this.player.y, STAFF_BUMP_DISTANCE)) {
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
   * first. Each radio raises one level, and each guard radios once per episode.
   */
  private updateRadio(now: number): void {
    const tick = this.guards.radio(now, DETECTION.alert.radioAfterMs);
    if (tick.anyAlert) {
      touchAlert(now);
    }
    for (const guard of tick.radioed) {
      const level = raiseAlert(now);
      recordAlertLevel(level);
      this.triggerAlarmShake();
      this.awareness.bark(guard, 'radio', now, this.player.x, this.player.y);
    }
  }

  /**
   * How far along a guard's radio call is, 0..1, for the ring over their
   * head. -1 when there is no call to show: not alert, cannot see the player,
   * or already made the call this episode.
   */
  private radioProgress(guard: Guard, now: number): number {
    if (
      guard.state !== 'alert' ||
      !guard.canSeePlayer ||
      guard.alertSince <= 0 ||
      this.guards.hasRadioed(guard)
    ) {
      return -1;
    }
    return Phaser.Math.Clamp((now - guard.alertSince) / DETECTION.alert.radioAfterMs, 0, 1);
  }

  /**
   * Applies level decay and (re)applies guard effects when the level changes.
   * A change after the first application also raises the banner: the first
   * application is the scene settling in (a fresh start or a detain restart
   * on an already-raised site), which is not news.
   */
  private updateAlertLevel(now: number): void {
    decayAlert(now, DETECTION.alert.level1DecayMs, DETECTION.alert.level2DecayMs);
    const level = getMission().alertLevel;
    if (level === this.appliedAlertLevel) {
      return;
    }
    const previous = this.appliedAlertLevel;
    this.appliedAlertLevel = level;
    this.guards.applyAlertLevel(level);
    if (previous !== -1) {
      this.alertBanner.show(level, previous);
    }
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
      this.physics.add.collider(
        this.player.sprite,
        member.sprite,
        () => {
          member.sprite.setImmovable(false);
        },
        () => {
          // Circle-to-circle separation otherwise moves both bodies even when
          // staff are not pushable. Anchor only for this contact, then release
          // them so wall and closed-door collision still works normally.
          member.sprite.setImmovable(true);
          return true;
        }
      );
    }
  }

  private wireDoorColliders(): void {
    for (const door of this.doors) {
      this.physics.add.collider(this.player.sprite, door.gameObject);
      for (const guard of this.guards.guards) {
        this.physics.add.collider(guard.sprite, door.gameObject);
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
      const wasOpen = this.doorAudioState.get(door.id) ?? door.isOpen;
      let badgeEntered = false;
      if (door.kind === 'badge') {
        // Any authorised staff standing near a badge door opens it (the tailgate
        // window keeps it open for a moment after they walk on). In lockdown the
        // badge readers deny everyone, staff included.
        for (const member of this.staff) {
          const authorised = member.isAuthorisedFor(door.id);
          const inRange = authorised && Phaser.Math.Distance.Between(
            member.x, member.y, door.centreX, door.centreY
          ) < STAFF_BADGE_DISTANCE;
          if (this.badgeAttemptEdges.entered(`${member.id}:${door.id}`, inRange)) {
            badgeEntered = true;
          }
          if (inRange) {
            door.badge(now, lockdown);
          }
        }
      }
      door.update(now, lockdown, this.player.x, this.player.y);
      if (door.isOpen !== wasOpen) {
        const group = door.kind === 'shutter' ? 'shutter' : 'door-latch';
        this.playWorldFoley(group, door.centreX, door.centreY, 600);
        if (door.kind === 'badge' && door.isOpen) {
          this.playWorldFoley('badge-accept', door.centreX, door.centreY, 600);
        }
      } else if (badgeEntered && lockdown) {
        this.playWorldFoley('badge-deny', door.centreX, door.centreY, 600);
      }
      this.doorAudioState.set(door.id, door.isOpen);
    }
  }

  /** Running (and, up close, walking) footsteps make noise the guards investigate. */
  private hearFootsteps(): void {
    if (this.player.noiseRadius <= 0) {
      return;
    }
    this.guards.hearNoise(this.player.x, this.player.y, this.player.noiseRadius);
  }

  /** A bolt landed: pull any guard within earshot to investigate the spot. */
  private onNoise(x: number, y: number): void {
    // Draw the reach of the noise whether or not anyone is close enough to
    // hear it. A throw that lands out of earshot is still information: it
    // shows the player how far a bolt carries, which is what made bolts feel
    // redundant in the Phase 20 playtest.
    this.noiseRings.spawn(x, y, this.time.now, {
      endRadiusPx: THROW.noiseRadiusPx,
      lifeMs: THROW.noiseRingLifeMs,
    });
    this.guards.hearNoise(x, y, THROW.noiseRadiusPx);
  }

  /** If the player slips through an open badge door in a guard's sight, it reacts. */
  private witnessTailgate(): void {
    for (const guard of this.guards.guards) {
      if (!guard.canSeePlayer) {
        continue;
      }
      for (const door of this.doors) {
        if (door.kind === 'badge' && door.isOpen && door.contains(this.player.x, this.player.y)) {
          guard.investigatePoint(this.player.x, this.player.y);
          break;
        }
      }
    }
  }

  private spawnGuards(map: BuildingMap): void {
    const data = this.cache.json.get(this.guardDataKey) as GuardsData | undefined;
    this.guards = new GuardRoster(
      this,
      data?.guards ?? [],
      map.walls,
      this.navGrid,
      (guard, state, previous) => this.onGuardStateCue(guard, state, previous)
    );
    for (const guard of this.guards.guards) {
      this.physics.add.collider(guard.sprite, this.walls);
    }
  }

  /** Caught: a sharp DETAINED beat, then fade and reset the run to the last checkpoint. */
  private detain(): void {
    this.closeConsole();
    recordDetain();
    this.detained = true;
    this.physics.pause();
    this.edgeMarkers.clear();

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

    this.time.delayedCall(READABILITY.detain.bannerMs, () =>
      fadeOutThen(this, () => this.scene.restart())
    );
  }

  /**
   * The noise the player can see. Guard footfalls ring within hearing range
   * (Phase 15's visual ear, now one cadence per guard). The player's own noise
   * is a faint steady ring at the radius guards can hear, plus a ripple per
   * footstep that grows to that same radius, so a run visibly shouts and a
   * creep visibly says nothing.
   */
  private updateNoiseRings(
    now: number,
    dtMs: number,
    pace: 'idle' | 'creep' | 'walk' | 'run',
    playerVelocity: { x: number; y: number }
  ): void {
    for (const guard of this.guards.footfalls(
      now,
      this.player.x,
      this.player.y,
      READABILITY.noiseRings.rangePx,
      READABILITY.noiseRings.stepIntervalMs
    )) {
      this.noiseRings.spawn(guard.x, guard.y, now);
    }

    const radius = this.player.noiseRadius;
    this.playerRing.clear();
    const moving = Math.hypot(playerVelocity.x, playerVelocity.y) > 1;
    if (radius > 0 && pace !== 'idle') {
      this.playerRing.lineStyle(2, NOISE_RING_TINT, HUD.playerNoise.ringAlpha);
      this.playerRing.strokeCircle(this.player.x, this.player.y, radius);
      if (moving) {
        this.playerStepMs += dtMs;
        const interval = AUDIO.stepIntervalMs[pace];
        if (this.playerStepMs >= interval) {
          this.playerStepMs -= interval;
          this.noiseRings.spawn(this.player.x, this.player.y, now, {
            endRadiusPx: radius,
            lifeMs: HUD.playerNoise.rippleLifeMs,
          });
        }
      }
    } else {
      this.playerStepMs = 0;
    }
    this.noiseRings.update(now);
  }

  /**
   * A guard changed state: bark, offer one transition cue, and shake exactly
   * on ALERT. The bark event depends on where the guard came from, so a
   * guard losing sight of you says something different from one hearing a
   * noise for the first time.
   */
  private onGuardStateCue(guard: Guard, state: GuardState, previous: GuardState): void {
    const now = this.time.now;
    const px = this.player.x;
    const py = this.player.y;
    if (state === 'curious') {
      if (previous === 'alert') {
        this.awareness.bark(guard, 'lostSight', now, px, py);
      } else {
        this.awareness.bark(guard, 'curious', now, px, py);
        this.offerSecurityCue('guard-curious', now, guard.x, guard.y);
      }
    } else if (state === 'patrol') {
      this.awareness.bark(guard, 'giveUp', now, px, py);
    } else if (state === 'alert') {
      this.awareness.bark(guard, 'alert', now, px, py);
      // A guard going full ALERT on a disguised player burns the disguise for
      // the rest of the run: security now knows the vest.
      const disguise = getMission().disguise;
      if (disguise.worn && !disguise.blown) {
        blowDisguise();
        recordDisguiseBlown();
      }
      this.offerSecurityCue('guard-alert', now, guard.x, guard.y);
      this.triggerAlarmShake();
    }
  }

  private playWorldFoley(
    group: 'metal-impact' | 'badge-accept' | 'badge-deny' | 'door-latch' | 'shutter' |
      'breaker-trip' | 'camera-return' | 'plant-complete',
    sourceX: number,
    sourceY: number,
    rangePx: number
  ): void {
    this.audio.playWorldFoley(group, {
      sourceX,
      sourceY,
      playerX: this.player.x,
      playerY: this.player.y,
      walls: this.mapWalls,
      closedDoors: this.doors.filter((door) => !door.isOpen).map((door) => door.rect),
      rangePx,
    });
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

  /** Assembles everything the HUD shows this frame from live state. */
  private buildHudFrame(
    now: number,
    pace: 'idle' | 'creep' | 'walk' | 'run',
    lightAtPlayer: number,
    nearest: Guard | undefined
  ): HudFrame {
    const target = this.objectives.currentTarget();
    const plantTarget = (this.level.venue?.plantTarget ?? 'rack 4 in the server room').toUpperCase();
    const objective =
      target?.kind === 'exfil'
        ? { heading: HUD.objective.exfil, detail: HUD.objective.exfilDetail }
        : target
          ? { heading: HUD.objective.plant, detail: plantTarget }
          : { heading: HUD.objective.exfil, detail: HUD.objective.exfilDetail };
    const disguise = getMission().disguise;
    return {
      pace,
      noiseRadiusPx: this.player.noiseRadius,
      noiseMaxPx: MOVEMENT.noiseRadii.run,
      bolts: this.throwController.remaining,
      boltsMax: THROW.boltCount,
      site: SITE_LABELS[getMission().alertLevel] ?? 'CALM',
      exposure: lightAtPlayer,
      objective,
      evidence: this.objectives.secondaryProgress(),
      disguise: !disguise.worn ? 'none' : disguise.blown ? 'blown' : 'worn',
      loops: this.cameraSystem
        .feedInfos(now)
        .filter((f) => f.frozenRemainingMs > 0)
        .map((f) => ({ id: f.id, secondsLeft: Math.ceil(f.frozenRemainingMs / 1000) })),
      dev: import.meta.env.DEV
        ? { device: this.controller.activeDevice, lines: this.debugLines(nearest) }
        : null,
    };
  }

  /** The dev-build readouts under the HUD when the guard view (H) is on. */
  private debugLines(nearest: Guard | undefined): string[] {
    if (!this.guardDebugOn) {
      return [];
    }
    const stats = getRunStats();
    const lines: string[] = [];
    if (nearest) {
      lines.push(
        `GUARD   ${nearest.id} ${nearest.state.toUpperCase()}`,
        `SUSP    ${Math.round(nearest.suspicion)}%`,
        `SEES    ${nearest.canSeePlayer ? 'YES' : 'no'}`,
        `LIGHT   ${Math.round(this.lightModel.computeLightAt(this.player.x, this.player.y) * 100)}%`,
        `SPOTS   ${stats.timesSpotted}`,
        `CATCH   ${stats.detains}`,
        ''
      );
    }
    lines.push(...this.doors.map((d) => `${d.id.padEnd(7)} ${d.isOpen ? 'OPEN' : 'shut'}`));
    lines.push('', ...this.cameraSystem.debugLines());
    return lines;
  }

  /** Guard debug (H): each guard's sight line to the player and a suspicion bar. */
  private drawGuardDebug(): void {
    this.guardDebug.clear();
    if (!this.guardDebugOn) {
      return;
    }
    for (const g of this.guards.guards) {
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
