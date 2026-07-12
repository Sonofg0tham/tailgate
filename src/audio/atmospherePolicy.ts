export type VenueProfileId = 'building-c' | 'data-centre' | 'warehouse';
export type VenueDetailCue = 'printer-kitchen' | 'relay-tick' | 'settling-metal';

export interface LevelAudioProfile {
  profile: VenueProfileId;
  detailCue: VenueDetailCue;
  detailEveryMinMs: number;
  detailEveryMaxMs: number;
}

export function venueProfile(profile: LevelAudioProfile | undefined): LevelAudioProfile {
  return profile ?? {
    profile: 'building-c',
    detailCue: 'printer-kitchen',
    detailEveryMinMs: 9000,
    detailEveryMaxMs: 18000,
  };
}

export interface AlertTensionProfile {
  droneHz: number;
  pulseHz: number;
  pulseIntervalMs: number;
  filteredNoise: boolean;
}

export function alertTensionProfile(alertLevel: number): AlertTensionProfile | null {
  if (alertLevel <= 0) return null;
  if (alertLevel === 1) {
    return { droneHz: 110, pulseHz: 220, pulseIntervalMs: 1200, filteredNoise: false };
  }
  return { droneHz: 73, pulseHz: 146, pulseIntervalMs: 520, filteredNoise: true };
}

/** A changed alert state starts its own rhythm now, never on the old state deadline. */
export function nextTensionPulseAt(
  previousLevel: number,
  alertLevel: number,
  nowMs: number,
  currentDeadlineMs: number
): number {
  if (alertLevel <= 0) return 0;
  return previousLevel === alertLevel ? currentDeadlineMs : nowMs;
}
