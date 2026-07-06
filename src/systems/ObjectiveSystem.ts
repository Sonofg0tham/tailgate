import Phaser from 'phaser';
import { OBJECTIVES } from '../config/objectives';
import { addPhotographed, getMission, setPlanted } from '../state/mission';
import { recordPlanted, recordSecondary } from '../state/runStats';
import type { ObjectivePoint } from '../world/BuildingMap';

/** What the objective system wants the scene to know after a frame. */
export interface ObjectiveTick {
  /** The device was planted this frame. */
  plantedNow: boolean;
  /** A secondary was photographed this frame (its id). */
  photographedNow: string | null;
  /** The player reached the van with the device planted: mission over. */
  exfilNow: boolean;
  /** The HUD prompt line to show, or null for none. */
  prompt: string | null;
}

/** Everything the system needs to know about this frame to run the hold rules. */
export interface ObjectiveFrame {
  now: number;
  dtMs: number;
  playerX: number;
  playerY: number;
  /** True while the interact control (E / pad A) is held. */
  interactHeld: boolean;
  /** True if the player moved this frame (moving cancels a hold). */
  playerMoving: boolean;
  /** True if a guard can currently see the player (spotted cancels a hold). */
  seenByGuard: boolean;
  /** True if a guard or staff member is bumping the player (cancels a hold). */
  bumped: boolean;
}

/**
 * The mission objectives: plant the rogue device on rack 4 (hold interact for
 * 3 seconds, uninterrupted), photograph the two secondaries (shorter holds),
 * then exfil to the van. Draws a pulsing amber marker on each incomplete
 * objective and a progress bar over the player during a hold. Interruptions
 * (moving, being seen, being bumped, releasing the key) cancel the hold, which
 * can simply be retried.
 */
export class ObjectiveSystem {
  private readonly markers: Phaser.GameObjects.Graphics;
  private readonly progress: Phaser.GameObjects.Graphics;
  private readonly points: ObjectivePoint[];
  private readonly exfil: Phaser.Math.Vector2;

  /** Id of the objective currently being held, or null. */
  private holdingId: string | null = null;
  private holdMs = 0;
  private exfilFired = false;

  constructor(scene: Phaser.Scene, points: ObjectivePoint[], exfil: Phaser.Math.Vector2) {
    this.points = points;
    this.exfil = exfil;
    this.markers = scene.add.graphics().setDepth(35);
    this.progress = scene.add.graphics().setDepth(60);
  }

  update(frame: ObjectiveFrame): ObjectiveTick {
    const tick: ObjectiveTick = {
      plantedNow: false,
      photographedNow: null,
      exfilNow: false,
      prompt: null,
    };

    const mission = getMission();
    const nearest = this.nearestIncomplete(frame.playerX, frame.playerY);

    // The hold: progress while every condition stays clean, cancel otherwise.
    if (nearest && frame.interactHeld) {
      const interrupted = frame.playerMoving || frame.seenByGuard || frame.bumped;
      if (this.holdingId !== nearest.id) {
        this.holdingId = nearest.id;
        this.holdMs = 0;
      }
      if (interrupted) {
        this.cancelHold();
      } else {
        this.holdMs += frame.dtMs;
        const needed = nearest.kind === 'plant' ? OBJECTIVES.plantHoldMs : OBJECTIVES.photoHoldMs;
        const pct = Math.min(this.holdMs / needed, 1);
        tick.prompt =
          nearest.kind === 'plant'
            ? `PLANTING DEVICE... ${Math.round(pct * 100)}%`
            : `PHOTOGRAPHING... ${Math.round(pct * 100)}%`;
        this.drawProgress(frame.playerX, frame.playerY, pct);
        if (this.holdMs >= needed) {
          this.complete(nearest, tick);
        }
      }
    } else {
      this.cancelHold();
      if (nearest) {
        tick.prompt =
          nearest.kind === 'plant' ? '[E] HOLD TO PLANT DEVICE' : '[E] HOLD TO PHOTOGRAPH';
      } else if (mission.planted && !this.exfilFired) {
        tick.prompt = 'DEVICE PLANTED. RETURN TO THE VAN.';
      }
    }

    // Exfil: back at the van with the device planted ends the mission.
    if (mission.planted && !this.exfilFired) {
      const dist = Phaser.Math.Distance.Between(frame.playerX, frame.playerY, this.exfil.x, this.exfil.y);
      if (dist <= OBJECTIVES.exfilRangePx) {
        this.exfilFired = true;
        tick.exfilNow = true;
      }
    }

    this.drawMarkers(frame.now);
    return tick;
  }

  private complete(point: ObjectivePoint, tick: ObjectiveTick): void {
    this.cancelHold();
    if (point.kind === 'plant') {
      setPlanted();
      recordPlanted();
      tick.plantedNow = true;
    } else {
      addPhotographed(point.id);
      recordSecondary(point.id);
      tick.photographedNow = point.id;
    }
  }

  private cancelHold(): void {
    this.holdingId = null;
    this.holdMs = 0;
    this.progress.clear();
  }

  /** The nearest not-yet-completed objective within interact range, or null. */
  private nearestIncomplete(px: number, py: number): ObjectivePoint | null {
    const mission = getMission();
    let best: ObjectivePoint | null = null;
    let bestDist: number = OBJECTIVES.interactRangePx;
    for (const point of this.points) {
      const done =
        point.kind === 'plant' ? mission.planted : mission.photographed.includes(point.id);
      if (done) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(px, py, point.x, point.y);
      if (dist <= bestDist) {
        best = point;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Pulsing amber diamond on each incomplete objective; van marker post-plant. */
  private drawMarkers(now: number): void {
    this.markers.clear();
    const mission = getMission();
    const pulse = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(now / 300));
    this.markers.lineStyle(2, 0xffb000, pulse);
    for (const point of this.points) {
      const done =
        point.kind === 'plant' ? mission.planted : mission.photographed.includes(point.id);
      if (done) {
        continue;
      }
      this.drawDiamond(point.x, point.y - 26, 7);
    }
    if (mission.planted && !this.exfilFired) {
      this.drawDiamond(this.exfil.x, this.exfil.y - 30, 9);
    }
  }

  private drawDiamond(cx: number, cy: number, r: number): void {
    this.markers.beginPath();
    this.markers.moveTo(cx, cy - r);
    this.markers.lineTo(cx + r, cy);
    this.markers.lineTo(cx, cy + r);
    this.markers.lineTo(cx - r, cy);
    this.markers.closePath();
    this.markers.strokePath();
  }

  /** Amber progress bar just above the player during a hold. */
  private drawProgress(px: number, py: number, pct: number): void {
    const w = 44;
    const h = 6;
    const x = px - w / 2;
    const y = py - 30;
    this.progress.clear();
    this.progress.fillStyle(0x000000, 0.55);
    this.progress.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.progress.fillStyle(0xffb000, 1);
    this.progress.fillRect(x, y, w * pct, h);
  }
}
