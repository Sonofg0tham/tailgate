import { describe, expect, it } from 'vitest';
import {
  chooseOcclusionCutoff,
  cuePriority,
  distanceGain,
  isActuallyMoving,
  panForPositions,
  SecurityCueArbitrator,
} from './audioPolicy';

describe('audio spatial policy', () => {
  it('pans a source across the stereo field relative to the listener', () => {
    expect(panForPositions(100, 0, 0, 200)).toBe(0.5);
    expect(panForPositions(-400, 0, 0, 200)).toBe(-1);
  });

  it('attenuates linearly to silence at the hearing range', () => {
    expect(distanceGain(50, 100)).toBe(0.5);
    expect(distanceGain(100, 100)).toBe(0);
    expect(distanceGain(150, 100)).toBe(0);
  });

  it('chooses the wall cutoff only when the source is occluded', () => {
    expect(chooseOcclusionCutoff(false, 4200, 500)).toBe(4200);
    expect(chooseOcclusionCutoff(true, 4200, 500)).toBe(500);
  });
});

describe('movement audio policy', () => {
  it('requires actual body velocity before scheduling footsteps', () => {
    expect(isActuallyMoving(0, 0)).toBe(false);
    expect(isActuallyMoving(0.5, 0.5)).toBe(false);
    expect(isActuallyMoving(2, 0)).toBe(true);
  });
});

describe('security cue policy', () => {
  it('orders cue severity from curious through camera alarm', () => {
    expect(cuePriority('guard-curious')).toBeLessThan(cuePriority('camera-ping'));
    expect(cuePriority('camera-ping')).toBeLessThan(cuePriority('guard-alert'));
    expect(cuePriority('guard-alert')).toBeLessThan(cuePriority('camera-alarm'));
  });

  it('keeps only the highest severity cue inside a 250ms window', () => {
    const arbitrator = new SecurityCueArbitrator(250);
    expect(arbitrator.offer('guard-curious', 1000)).toEqual({ cue: 'guard-curious', playAtMs: 1250 });
    expect(arbitrator.offer('camera-alarm', 1100)).toEqual({ cue: 'camera-alarm', playAtMs: 1250 });
    expect(arbitrator.offer('camera-ping', 1200)).toEqual({ cue: 'camera-alarm', playAtMs: 1250 });
    expect(arbitrator.takeReady(1249)).toBeNull();
    expect(arbitrator.takeReady(1250)).toBe('camera-alarm');
  });

  it('starts a fresh arbitration window after the previous cue is taken', () => {
    const arbitrator = new SecurityCueArbitrator();
    arbitrator.offer('guard-alert', 0);
    expect(arbitrator.takeReady(250)).toBe('guard-alert');
    expect(arbitrator.offer('camera-ping', 300)).toEqual({ cue: 'camera-ping', playAtMs: 550 });
  });
});
