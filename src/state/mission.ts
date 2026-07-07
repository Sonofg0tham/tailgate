/**
 * Mission state that must survive a detain (which restarts the scene): the
 * building alert level, the checkpoint, and objective completion. Module-level
 * singleton like runStats. resetMission() starts a fresh engagement.
 *
 * Checkpoints per GAME_DESIGN: one on first entering the building, one
 * immediately after planting the device. A detain restarts at the last
 * checkpoint with the alert state preserved.
 */

export interface Checkpoint {
  x: number;
  y: number;
  /** Bolts the player had when the checkpoint was set. */
  bolts: number;
}

interface MissionState {
  /** The contract this engagement belongs to, so a checkpoint set in one
   * building can never be resumed in another. Null before the first launch. */
  levelId: string | null;
  /** Building alert level: 0 calm, 1 cautious, 2 lockdown. */
  alertLevel: number;
  /** Scene-clock timestamp when level 1 last had an incident (for decay). */
  level1SetAt: number;
  /** The last checkpoint, or null to start at the van. */
  checkpoint: Checkpoint | null;
  /** True once the rogue device is planted on rack 4. */
  planted: boolean;
  /** Ids of photographed secondary objectives. */
  photographed: string[];
  /** Console loop charges spent this engagement. Survives a detain restart. */
  hijackChargesUsed: number;
  /** The hi-vis disguise: worn once picked up, blown once a guard reaches
   * ALERT while it is worn. Both survive a detain restart. */
  disguise: { worn: boolean; blown: boolean };
}

function freshMission(levelId: string | null): MissionState {
  return {
    levelId,
    alertLevel: 0,
    level1SetAt: 0,
    checkpoint: null,
    planted: false,
    photographed: [],
    hijackChargesUsed: 0,
    disguise: { worn: false, blown: false },
  };
}

let state: MissionState = freshMission(null);

export function getMission(): Readonly<MissionState> {
  return state;
}

export function setCheckpoint(cp: Checkpoint): void {
  state.checkpoint = cp;
}

export function setPlanted(): void {
  state.planted = true;
}

/** Spends one console loop charge. The caller checks availability first. */
export function useHijackCharge(): void {
  state.hijackChargesUsed += 1;
}

/** Puts the hi-vis on. There is no taking it off in v2. */
export function wearDisguise(): void {
  state.disguise.worn = true;
}

/** Burns the disguise for the rest of the run (a guard went ALERT on it). */
export function blowDisguise(): void {
  state.disguise.blown = true;
}

export function addPhotographed(id: string): void {
  if (!state.photographed.includes(id)) {
    state.photographed.push(id);
  }
}

/** Raises the alert one level (radio event). Level 2 is the ceiling. */
export function raiseAlert(nowMs: number): number {
  state.alertLevel = Math.min(2, state.alertLevel + 1);
  state.level1SetAt = nowMs;
  return state.alertLevel;
}

/** Marks fresh trouble at level 1, restarting the decay clock. */
export function touchAlert(nowMs: number): void {
  if (state.alertLevel === 1) {
    state.level1SetAt = nowMs;
  }
}

/** Decays cautious back to calm after the quiet period. Lockdown never decays. */
export function decayAlert(nowMs: number, decayMs: number): void {
  if (state.alertLevel === 1 && nowMs - state.level1SetAt >= decayMs) {
    state.alertLevel = 0;
  }
}

export function resetMission(levelId: string | null = null): void {
  state = freshMission(levelId);
}
