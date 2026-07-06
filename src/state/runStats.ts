/**
 * Run statistics, kept in memory across scene restarts (detains restart the
 * scene, and the numbers must survive). The Engagement Report reads these at
 * exfil to describe what actually happened.
 *
 * A module-level singleton on purpose: it must outlive scene.restart(), so it
 * cannot live on the scene. resetRunStats() starts a fresh engagement.
 */

/** The ways into the building the player actually used this run. */
export type IngressRoute = 'smokers' | 'reception' | 'shutter';

export interface RunStats {
  /** Wall-clock ms when the run began (Date.now()), for time on site. */
  startedAt: number;
  /** Times a guard fully spotted the player (reached ALERT). */
  timesSpotted: number;
  /** Times the player was caught. */
  detains: number;
  /** Distraction bolts thrown this run. */
  boltsThrown: number;
  /** Which entrances the player slipped through, in first-use order. */
  ingressRoutes: IngressRoute[];
  /** Elapsed ms when each entrance was first used, for the report timestamps. */
  ingressAtMs: Partial<Record<IngressRoute, number>>;
  /** True if the player tailgated the badge gate (entered it without a badge). */
  tailgated: boolean;
  /** Highest building alert level reached (0 calm, 1 cautious, 2 lockdown). */
  maxAlertLevel: number;
  /** Elapsed ms into the run when the device was planted, or null. */
  plantedAtMs: number | null;
  /** Elapsed ms when each secondary was photographed, keyed by objective id. */
  secondaries: Record<string, number>;
  /** Elapsed ms at exfil (mission end), or null while still on site. */
  exfilAtMs: number | null;
}

function freshStats(): RunStats {
  return {
    startedAt: Date.now(),
    timesSpotted: 0,
    detains: 0,
    boltsThrown: 0,
    ingressRoutes: [],
    ingressAtMs: {},
    tailgated: false,
    maxAlertLevel: 0,
    plantedAtMs: null,
    secondaries: {},
    exfilAtMs: null,
  };
}

let stats: RunStats = freshStats();

export function getRunStats(): Readonly<RunStats> {
  return stats;
}

/** Elapsed play time so far, in ms. */
export function elapsedMs(): number {
  return Date.now() - stats.startedAt;
}

export function recordSpotted(): void {
  stats.timesSpotted += 1;
}

export function recordDetain(): void {
  stats.detains += 1;
}

export function recordBoltThrown(): void {
  stats.boltsThrown += 1;
}

/** Records an entrance the first time the player passes through it. */
export function recordIngress(route: IngressRoute): void {
  if (!stats.ingressRoutes.includes(route)) {
    stats.ingressRoutes.push(route);
    stats.ingressAtMs[route] = elapsedMs();
  }
  if (route === 'reception') {
    stats.tailgated = true;
  }
}

export function recordAlertLevel(level: number): void {
  stats.maxAlertLevel = Math.max(stats.maxAlertLevel, level);
}

export function recordPlanted(): void {
  if (stats.plantedAtMs === null) {
    stats.plantedAtMs = elapsedMs();
  }
}

export function recordSecondary(id: string): void {
  if (!(id in stats.secondaries)) {
    stats.secondaries[id] = elapsedMs();
  }
}

export function recordExfil(): void {
  if (stats.exfilAtMs === null) {
    stats.exfilAtMs = elapsedMs();
  }
}

/** Starts a completely fresh engagement (the report screen's reset button). */
export function resetRunStats(): void {
  stats = freshStats();
}
