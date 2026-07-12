import { describe, expect, it } from 'vitest';
import {
  chooseOcclusionCutoff,
  cuePriority,
  distanceGain,
  isActuallyMoving,
  velocityFromDisplacement,
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
  it('reports no actual movement when non-idle input produces zero displacement', () => {
    const requestedSpeed = 'walk';
    const velocity = velocityFromDisplacement(0, 0, 16);

    expect(requestedSpeed).not.toBe('idle');
    expect(isActuallyMoving(velocity.x, velocity.y)).toBe(false);
  });

  it('requires actual body velocity before scheduling footsteps', () => {
    expect(isActuallyMoving(0, 0)).toBe(false);
    expect(isActuallyMoving(0.5, 0.5)).toBe(false);
    expect(isActuallyMoving(2, 0)).toBe(true);
  });

  it('reports a paused guard as stationary despite its next requested velocity', () => {
    const requestedVelocity = { x: 90, y: 0 };
    const completedVelocity = velocityFromDisplacement(0, 0, 16);

    expect(requestedVelocity.x).toBeGreaterThan(0);
    expect(isActuallyMoving(completedVelocity.x, completedVelocity.y)).toBe(false);
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
    expect(arbitrator.offer('guard-curious', 1000)).toEqual({
      readyCue: null,
      pending: { cue: 'guard-curious', playAtMs: 1250 },
    });
    expect(arbitrator.offer('camera-alarm', 1100).pending).toEqual({
      cue: 'camera-alarm',
      playAtMs: 1250,
    });
    expect(arbitrator.offer('camera-ping', 1200).pending).toEqual({
      cue: 'camera-alarm',
      playAtMs: 1250,
    });
    expect(arbitrator.takeReady(1249)).toBeNull();
    expect(arbitrator.takeReady(1250)).toBe('camera-alarm');
  });

  it('starts a fresh arbitration window after the previous cue is taken', () => {
    const arbitrator = new SecurityCueArbitrator();
    arbitrator.offer('guard-alert', 0);
    expect(arbitrator.takeReady(250)).toBe('guard-alert');
    expect(arbitrator.offer('camera-ping', 300).pending).toEqual({
      cue: 'camera-ping',
      playAtMs: 550,
    });
  });

  it('returns the existing winner at the exact boundary before queueing the new cue', () => {
    const arbitrator = new SecurityCueArbitrator();
    arbitrator.offer('camera-alarm', 1000);

    expect(arbitrator.offer('guard-curious', 1250)).toEqual({
      readyCue: 'camera-alarm',
      pending: { cue: 'guard-curious', playAtMs: 1500 },
    });
  });

  it('returns an overdue winner before queueing a later offer', () => {
    const arbitrator = new SecurityCueArbitrator();
    arbitrator.offer('guard-alert', 1000);

    expect(arbitrator.offer('camera-ping', 1600)).toEqual({
      readyCue: 'guard-alert',
      pending: { cue: 'camera-ping', playAtMs: 1850 },
    });
  });
});
