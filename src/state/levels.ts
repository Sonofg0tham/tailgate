import type { ReportVenue } from '../report/generateReport';

/**
 * The level registry and the active level, module-level singletons like
 * settings and mission. The registry is read from public/data/levels.json
 * (loaded by the kiosk on boot), so new contracts are added by editing data,
 * never scene code. The active level survives scene restarts, which is what a
 * detain needs: it restarts the building scene for the same contract.
 */

/** The pre-mission briefing copy, authored per level in levels.json. */
export interface LevelBriefing {
  /** Rules of engagement bullet lines. */
  roe: string[];
  /** Site intel lines teaching the venue's signature mechanic in fiction. */
  intel: string[];
}

/** One first-run hint: a circle in the world and a line of consultant copy. */
export interface LevelHint {
  /** Stable id, unique within the level, for the once-per-profile flag. */
  id: string;
  x: number;
  y: number;
  radiusPx: number;
  text: string;
}

export interface LevelDef {
  /** Stable id used for data paths, cache keys and saved progress. */
  id: string;
  /** False for contracts that exist in the schedule but have no map yet. */
  playable: boolean;
  name: string;
  client: string;
  site: string;
  scope: string;
  /** Engagement reference printed on the contract and the report. */
  ref: string;
  map: string;
  guards: string;
  staff: string;
  cameras: string;
  /** Venue nouns for the report's finding copy; Building C wording if absent. */
  venue?: ReportVenue;
  /** The engagement briefing sheet copy; the sheet renders empty-safe without. */
  briefing?: LevelBriefing;
  /** First-run contextual hints; a level without them simply shows none. */
  hints?: LevelHint[];
}

let levels: LevelDef[] = [];
let activeLevelId: string | null = null;

/** Feeds the registry from the loaded levels.json. Safe to call repeatedly. */
export function initLevelRegistry(data: unknown): void {
  const parsed = (data as { levels?: LevelDef[] } | undefined)?.levels;
  if (Array.isArray(parsed) && parsed.length > 0) {
    levels = parsed;
  }
}

export function getLevels(): readonly LevelDef[] {
  return levels;
}

export function getLevel(id: string): LevelDef | undefined {
  return levels.find((level) => level.id === id);
}

/** The contract after this one in schedule order, or undefined at the end. */
export function nextLevelAfter(id: string): LevelDef | undefined {
  const index = levels.findIndex((level) => level.id === id);
  return index >= 0 ? levels[index + 1] : undefined;
}

export function setActiveLevel(id: string): void {
  activeLevelId = id;
}

export function getActiveLevelId(): string | null {
  return activeLevelId;
}

/**
 * The active level's definition. Falls back to the first playable level so a
 * stray start of the building scene still loads something sensible.
 */
export function getActiveLevel(): LevelDef {
  const found = activeLevelId ? getLevel(activeLevelId) : undefined;
  const fallback = levels.find((level) => level.playable);
  const level = found ?? fallback;
  if (!level) {
    throw new Error('Level registry is empty: levels.json failed to load.');
  }
  return level;
}
