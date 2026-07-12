import { describe, expect, it } from 'vitest';
import levels from '../../public/data/levels.json';
import { alertTensionProfile, nextTensionPulseAt, venueProfile, type LevelAudioProfile } from './atmospherePolicy';
import { securityCueLayers, securityCueSignature } from './securityCues';
import { SecurityCueCoordinator } from './securityCueCoordinator';
import { cameraCueEvent } from '../systems/cameraCueEvent';

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

  it('routes every tonal-only cue layer through the same spatial filter and gain', () => {
    expect(securityCueLayers('guard-curious', { gain: 0.4, pan: -0.5, cutoffHz: 650 })).toEqual([
      { kind: 'tone', gain: 0.4, pan: -0.5, cutoffHz: 650 },
    ]);
  });

  it('routes both tone and noise layers through the same spatial filter and gain', () => {
    expect(securityCueLayers('camera-alarm', { gain: 0.6, pan: 0.25, cutoffHz: 4800 })).toEqual([
      { kind: 'tone', gain: 0.6, pan: 0.25, cutoffHz: 4800 },
      { kind: 'noise', gain: 0.6, pan: 0.25, cutoffHz: 4800 },
    ]);
  });

  it('consumes a ready winner when a boundary offer starts the next window', () => {
    const played: string[] = [];
    const coordinator = new SecurityCueCoordinator<string>((cue) => played.push(cue));
    coordinator.offer('camera-alarm', 1000, 'camera');
    coordinator.offer('guard-curious', 1250, 'guard');
    expect(played).toEqual(['camera-alarm']);
    expect(coordinator.flush(1500)).toBe('guard-curious');
  });

  it('rate limits repeated transitions without suppressing a more severe cue', () => {
    const coordinator = new SecurityCueCoordinator<string>(() => undefined);
    expect(coordinator.offer('camera-ping', 0, 'first')).toBe(true);
    expect(coordinator.offer('camera-ping', 100, 'second')).toBe(false);
    expect(coordinator.offer('camera-alarm', 100, 'alarm')).toBe(true);
  });

  it('keeps the accepted position when a repeated same-type offer is rejected', () => {
    const played: string[] = [];
    const coordinator = new SecurityCueCoordinator<string>((_cue, position) => played.push(position));
    coordinator.offer('camera-ping', 0, 'camera-a');
    coordinator.offer('camera-ping', 100, 'camera-b');
    coordinator.flush(250);
    expect(played).toEqual(['camera-a']);
  });
});

describe('camera audio wiring policy', () => {
  it('keeps camera source coordinates separate from the player investigation target', () => {
    expect(cameraCueEvent('cam-2', 800, 120, 450, 300)).toEqual({
      id: 'cam-2', sourceX: 800, sourceY: 120, investigateX: 450, investigateY: 300,
    });
  });
});

describe('tension transition timing', () => {
  it('fires immediately whenever the alert ladder changes', () => {
    expect(nextTensionPulseAt(0, 1, 1000, 0)).toBe(1000);
    expect(nextTensionPulseAt(1, 2, 1200, 2200)).toBe(1200);
    expect(nextTensionPulseAt(2, 0, 1500, 1720)).toBe(0);
  });
});
