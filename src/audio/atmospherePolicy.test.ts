import { describe, expect, it } from 'vitest';
import levels from '../../public/data/levels.json';
import { alertTensionProfile, venueProfile, type LevelAudioProfile } from './atmospherePolicy';
import { securityCueSignature } from './securityCues';
import { SecurityCueCoordinator } from './securityCueCoordinator';

describe('venue atmosphere policy', () => {
  it('selects a configured and distinct profile for every venue', () => {
    const profiles = levels.levels.map((level) => venueProfile(level.audio as LevelAudioProfile));
    expect(profiles.map((profile) => profile.profile)).toEqual([
      'building-c',
      'data-centre',
      'warehouse',
    ]);
    expect(profiles.map((profile) => profile.detailCue)).toEqual([
      'printer-kitchen',
      'relay-tick',
      'settling-metal',
    ]);
  });
});

describe('alert tension policy', () => {
  it('keeps calm silent and gives cautious and lockdown the required timing and frequencies', () => {
    expect(alertTensionProfile(0)).toBeNull();
    expect(alertTensionProfile(1)).toMatchObject({
      droneHz: 110,
      pulseHz: 220,
      pulseIntervalMs: 1200,
      filteredNoise: false,
    });
    expect(alertTensionProfile(2)).toMatchObject({
      droneHz: 73,
      pulseHz: 146,
      pulseIntervalMs: 520,
      filteredNoise: true,
    });
  });
});

describe('security cue policy', () => {
  it('gives every security event a distinct audible signature', () => {
    const cues = ['guard-curious', 'guard-alert', 'camera-ping', 'camera-alarm'] as const;
    const signatures = cues.map((cue) => securityCueSignature(cue));
    expect(new Set(signatures.map((signature) => JSON.stringify(signature))).size).toBe(4);
  });

  it('consumes a ready winner when a boundary offer starts the next window', () => {
    const played: string[] = [];
    const coordinator = new SecurityCueCoordinator((cue) => played.push(cue));
    coordinator.offer('camera-alarm', 1000);
    coordinator.offer('guard-curious', 1250);
    expect(played).toEqual(['camera-alarm']);
    expect(coordinator.flush(1500)).toBe('guard-curious');
  });

  it('rate limits repeated transitions without suppressing a more severe cue', () => {
    const coordinator = new SecurityCueCoordinator(() => undefined);
    expect(coordinator.offer('camera-ping', 0)).toBe(true);
    expect(coordinator.offer('camera-ping', 100)).toBe(false);
    expect(coordinator.offer('camera-alarm', 100)).toBe(true);
  });
});
