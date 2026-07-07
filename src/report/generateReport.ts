/**
 * Engagement Report generator. A pure data module, no Phaser, that turns a
 * finished run into the lines of a corporate pentest report. The report is the
 * game's signature end screen: dry, deadpan, and true to what actually
 * happened, so every line here is driven by RunStats, never invented.
 *
 * ReportScene renders whatever this returns. Keeping the two apart means the
 * report copy can be unit tested and tuned without touching rendering.
 */

import type { IngressRoute, RunStats } from '../state/runStats';
import { OBJECTIVES } from '../config/objectives';

/** The four outcome ratings, best to worst. */
export type Rating = 'GHOST' | 'PROFESSIONAL' | 'NOISY' | 'DETAINED';

/** Finding severities, ordered here worst to least for sorting. */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** A single report finding: a real thing the consultant exploited. */
export interface Finding {
  /** Sequential reference, e.g. "F-01". */
  ref: string;
  severity: Severity;
  text: string;
}

/** The complete report, ready to render. */
export interface ReportModel {
  header: {
    client: string;
    site: string;
    consultant: string;
    /** Engagement reference, e.g. "ENG-2026-0417/C". */
    ref: string;
    /** In-fiction date of the assessment. */
    date: string;
  };
  findings: Finding[];
  /** Deadpan lines describing what client security noticed, if anything. */
  clientDetections: string[];
  summary: {
    /** Time on site as "mm:ss". */
    timeOnSite: string;
    /** Highest alert level reached, e.g. "0 CALM". */
    alertLevel: string;
    /** Secondary objectives completed, e.g. "1 of 2". */
    secondaries: string;
  };
  rating: Rating;
  /** One dry line under the rating. */
  ratingRemark: string;
}

/** Sort order for findings: critical first, then down the list. */
const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Formats an elapsed play time as the in-fiction wall clock. The mission
 * "starts" at OBJECTIVES.reportClockStart, so a finding at 3 minutes 12
 * seconds elapsed reads as the clock time three minutes past the start.
 */
function stampClock(elapsedMs: number): string {
  const { hour, minute } = OBJECTIVES.reportClockStart;
  const totalMinutes = hour * 60 + minute + Math.floor(elapsedMs / 60000);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

/** Formats an elapsed duration in ms as "mm:ss". */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/** Zero-pads a number to two digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Turns an alert level number into a labelled string for the summary. */
function alertLabel(level: number): string {
  if (level >= 2) return '2 LOCKDOWN';
  if (level >= 1) return '1 CAUTIOUS';
  return '0 CALM';
}

/** Rating and its deadpan remark, derived from the run. */
function decideRating(stats: RunStats): { rating: Rating; remark: string } {
  if (stats.detains >= 1) {
    return {
      rating: 'DETAINED',
      remark: 'Objectives met. Dignity not recovered. See invoice for trouser repairs.',
    };
  }
  if (stats.maxAlertLevel >= 1) {
    return {
      rating: 'NOISY',
      remark: 'The site knew someone was there. Consultant is reminded this is a covert discipline.',
    };
  }
  if (stats.timesSpotted >= 1) {
    return {
      rating: 'PROFESSIONAL',
      remark: 'Observed but never reported. Acceptable tradecraft.',
    };
  }
  return {
    rating: 'GHOST',
    remark: 'No detections. The client is advised their CCTV budget is not working.',
  };
}

/** Whether an ingress route was used this run. */
function used(routes: readonly IngressRoute[], route: IngressRoute): boolean {
  return routes.includes(route);
}

/**
 * Venue nouns the finding copy is built from, so each contract's report reads
 * like it happened at that site. Authored per level in levels.json; anything
 * missing falls back to the Building C wording. Capitalised entries start
 * sentences; lower-case entries sit mid-sentence.
 */
export interface ReportVenue {
  /** Mid-sentence: where the device goes, e.g. "rack 4 in the server room". */
  plantTarget?: string;
  /** Sentence start: the propped fire door, e.g. "Fire door on the south elevation". */
  smokersDoor?: string;
  /** Mid-sentence: the badge gate, e.g. "the reception badge gate". */
  badgeGate?: string;
  /** Sentence start: the roller shutter, e.g. "Loading dock shutter". */
  shutter?: string;
  /** Sentence start: the CCTV console, e.g. "Security office console". */
  console?: string;
}

/** The Building C wording, standing in wherever a level authors nothing. */
const DEFAULT_VENUE: Required<ReportVenue> = {
  plantTarget: 'rack 4 in the server room',
  smokersDoor: 'Fire door on the south elevation',
  badgeGate: 'the reception badge gate',
  shutter: 'Loading dock shutter',
  console: 'Security office console',
};

/** The contract copy printed in the report header, from the level registry. */
export interface ReportLevelMeta {
  client: string;
  site: string;
  ref: string;
  venue?: ReportVenue;
}

/**
 * Builds the full report from a finished run. Only things that actually
 * happened produce findings, so a quiet run reads as a short report and a
 * messy one as a long one. The header and the finding copy name whichever
 * contract was played; the Building C copy stands as the fallback.
 */
export function generateReport(
  stats: RunStats,
  mission: { planted: boolean; photographed: string[] },
  level?: ReportLevelMeta,
): ReportModel {
  const findings: Omit<Finding, 'ref'>[] = [];
  const venue: Required<ReportVenue> = { ...DEFAULT_VENUE, ...level?.venue };

  // Ingress findings, stamped with when each entrance was actually used.
  if (used(stats.ingressRoutes, 'smokers')) {
    findings.push({
      severity: 'HIGH',
      text: `${venue.smokersDoor} propped open during staff smoking breaks. Consultant entered at ${stampClock(stats.ingressAtMs.smokers ?? 0)} without challenge.`,
    });
  }
  if (used(stats.ingressRoutes, 'reception') || stats.tailgated) {
    findings.push({
      severity: 'HIGH',
      text: `Consultant tailgated a staff member through ${venue.badgeGate} at ${stampClock(stats.ingressAtMs.reception ?? 0)}. Door dwell time (1.6s) permits unauthorised entry.`,
    });
  }
  if (used(stats.ingressRoutes, 'shutter')) {
    findings.push({
      severity: 'HIGH',
      text: `${venue.shutter} left unattended during delivery windows. Consultant entered at ${stampClock(stats.ingressAtMs.shutter ?? 0)}.`,
    });
  }

  // The primary objective: the planted device.
  if (stats.plantedAtMs !== null || mission.planted) {
    const at = stats.plantedAtMs ?? 0;
    findings.push({
      severity: 'CRITICAL',
      text: `Rogue device planted on ${venue.plantTarget} at ${stampClock(at)}. Device remained undetected at time of exfil.`,
    });
  }

  // The hi-vis disguise: authority theatre working as intended, unless a
  // guard eventually saw through it.
  if (stats.disguiseWornAtMs !== null) {
    const blown = stats.disguiseBlownAtMs !== null;
    findings.push({
      severity: 'MEDIUM',
      text: blown
        ? `Contractor hi-vis acquired on site at ${stampClock(stats.disguiseWornAtMs)} and accepted at distance, until security challenged it at ${stampClock(stats.disguiseBlownAtMs ?? 0)}.`
        : `Contractor hi-vis acquired on site at ${stampClock(stats.disguiseWornAtMs)}. Staff and security accepted the disguise at distance without challenge.`,
    });
  }

  // The security console: looped feeds are a control-room failure, not a
  // camera failure, so they get their own finding.
  if (stats.feedsFrozen.length > 0) {
    const feedCount = stats.feedsFrozen.length;
    findings.push({
      severity: 'HIGH',
      text: `${venue.console} left signed in and unattended. Consultant looped ${feedCount} CCTV feed(s) starting at ${stampClock(stats.firstHijackAtMs ?? 0)}; monitoring staff did not notice the repeated footage.`,
    });
  }

  // Secondary objectives, photographed as evidence.
  const workstationAt = stats.secondaries['workstation'];
  if (workstationAt !== undefined) {
    findings.push({
      severity: 'MEDIUM',
      text: `Unlocked, unattended workstation photographed at ${stampClock(workstationAt)}. Session was live and logged in.`,
    });
  }
  const stickynoteAt = stats.secondaries['stickynote'];
  if (stickynoteAt !== undefined) {
    findings.push({
      severity: 'MEDIUM',
      text: `Password recorded on an adhesive note, photographed at ${stampClock(stickynoteAt)}. Note was affixed to the monitor bezel.`,
    });
  }

  // Distraction bolts the client shrugged off.
  if (stats.boltsThrown > 0) {
    findings.push({
      severity: 'LOW',
      text: `Security staff investigated ${stats.boltsThrown} thrown object(s) without escalation or report.`,
    });
  }

  // Stable sort by severity, then number the refs F-01, F-02 and so on.
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const numbered: Finding[] = findings.map((finding, index) => ({
    ref: `F-${pad2(index + 1)}`,
    ...finding,
  }));

  // Client detections: the deadpan record of what the client noticed.
  const clientDetections: string[] = [];
  if (stats.timesSpotted > 0) {
    clientDetections.push(`Consultant observed by security staff on ${stats.timesSpotted} occasion(s).`);
  }
  if (stats.detains > 0) {
    clientDetections.push(
      `Consultant detained by client staff on ${stats.detains} occasion(s). Letter of authorisation presented.`,
    );
  }
  if (stats.disguiseBlownAtMs !== null) {
    clientDetections.push('Hi-vis disguise challenged by security and considered burned.');
  }
  if (stats.maxAlertLevel >= 1) {
    clientDetections.push('Site alert level raised to CAUTIOUS.');
  }
  if (stats.maxAlertLevel >= 2) {
    clientDetections.push('Full site lockdown initiated.');
  }
  if (clientDetections.length === 0) {
    clientDetections.push('None. Client security did not detect the assessment.');
  }

  const completedSecondaries = Object.keys(stats.secondaries).length;
  const { rating, remark } = decideRating(stats);

  return {
    header: {
      client: level?.client ?? 'MERIDIAN BUSINESS PARK',
      site: level?.site ?? 'BUILDING C',
      consultant: 'S0N0FG0THAM CONSULTING',
      ref: level?.ref ?? 'ENG-2026-0417/C',
      date: '05 JULY 2026',
    },
    findings: numbered,
    clientDetections,
    summary: {
      timeOnSite: formatDuration(stats.exfilAtMs ?? 0),
      alertLevel: alertLabel(stats.maxAlertLevel),
      secondaries: `${completedSecondaries} of 2`,
    },
    rating,
    ratingRemark: remark,
  };
}
