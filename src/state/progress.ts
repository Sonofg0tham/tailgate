/**
 * Campaign progress: per-contract unlocks and personal bests, persisted to
 * localStorage under one versioned key. This joins settings as the only other
 * thing the game stores; runs themselves still evaporate on reload.
 *
 * The module knows nothing about the level registry on purpose: callers decide
 * what completing a contract unlocks, so the unlock chain lives with the
 * schedule data, not in here.
 */

import type { Rating } from '../report/generateReport';

export interface LevelProgress {
  unlocked: boolean;
  /** Best outcome rating achieved, or null before the first completion. */
  bestRating: Rating | null;
  /** Fastest completed run in whole seconds, or null before the first. */
  bestTimeSec: number | null;
  completions: number;
}

interface ProgressState {
  version: 1;
  levels: Record<string, LevelProgress>;
}

const STORAGE_KEY = 'tailgate.progress';

/** Rating quality order, worst to best, for deciding a new personal best. */
const RATING_RANK: Record<Rating, number> = {
  DETAINED: 0,
  NOISY: 1,
  PROFESSIONAL: 2,
  GHOST: 3,
};

const state: ProgressState = { version: 1, levels: {} };

// Load any persisted progress. Guarded so a headless build never throws.
try {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    if (parsed.version === 1 && parsed.levels) {
      state.levels = parsed.levels;
    }
  }
} catch {
  // No storage available; a fresh campaign stands.
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; progress still works for this session.
  }
}

function entry(levelId: string): LevelProgress {
  let level = state.levels[levelId];
  if (!level) {
    level = { unlocked: false, bestRating: null, bestTimeSec: null, completions: 0 };
    state.levels[levelId] = level;
  }
  return level;
}

export function getLevelProgress(levelId: string): Readonly<LevelProgress> {
  return (
    state.levels[levelId] ?? {
      unlocked: false,
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
    }
  );
}

export function unlockLevel(levelId: string): void {
  const level = entry(levelId);
  if (!level.unlocked) {
    level.unlocked = true;
    persist();
  }
}

/** Records a finished run: any rating counts as a completion. */
export function recordCompletion(levelId: string, rating: Rating, timeSec: number): void {
  const level = entry(levelId);
  level.unlocked = true;
  level.completions += 1;
  if (level.bestRating === null || RATING_RANK[rating] > RATING_RANK[level.bestRating]) {
    level.bestRating = rating;
  }
  if (level.bestTimeSec === null || timeSec < level.bestTimeSec) {
    level.bestTimeSec = timeSec;
  }
  persist();
}
