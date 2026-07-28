import { beforeEach, describe, expect, it } from 'vitest';
import { decayAlert, getMission, raiseAlert, resetMission, touchAlert } from './mission';

/**
 * The alert ladder has to be able to come back down. Phase 20 playtest: a
 * permanent lockdown quietly removed the camera hijack for the rest of the
 * engagement, because the security console refuses to serve at lockdown. These
 * guard the stand-down path so nobody restores the dead end by accident.
 */
const LEVEL_1_DECAY_MS = 60000;
const LEVEL_2_DECAY_MS = 120000;

describe('building alert decay', () => {
  beforeEach(() => {
    resetMission('building-c');
  });

  it('stands lockdown down to cautious once the site has been quiet long enough', () => {
    raiseAlert(0);
    raiseAlert(0);
    expect(getMission().alertLevel).toBe(2);

    decayAlert(LEVEL_2_DECAY_MS, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);

    expect(getMission().alertLevel).toBe(1);
  });

  it('holds lockdown while the quiet period is still running', () => {
    raiseAlert(0);
    raiseAlert(0);

    decayAlert(LEVEL_2_DECAY_MS - 1, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);

    expect(getMission().alertLevel).toBe(2);
  });

  it('does not drop two levels in one step', () => {
    raiseAlert(0);
    raiseAlert(0);

    // Long enough to satisfy both thresholds at once. Standing down restarts
    // the clock, so the site lands on cautious and has to wait again.
    decayAlert(LEVEL_2_DECAY_MS * 10, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);

    expect(getMission().alertLevel).toBe(1);
  });

  it('decays cautious to calm after its own quiet period', () => {
    raiseAlert(0);
    expect(getMission().alertLevel).toBe(1);

    decayAlert(LEVEL_1_DECAY_MS, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);

    expect(getMission().alertLevel).toBe(0);
  });

  it('restarts the lockdown clock when there is fresh trouble', () => {
    raiseAlert(0);
    raiseAlert(0);

    // Trouble at 100s, so the stand-down clock runs from there, not from 0.
    touchAlert(100000);
    decayAlert(LEVEL_2_DECAY_MS, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);
    expect(getMission().alertLevel).toBe(2);

    decayAlert(100000 + LEVEL_2_DECAY_MS, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);
    expect(getMission().alertLevel).toBe(1);
  });

  it('leaves a calm site alone', () => {
    decayAlert(LEVEL_2_DECAY_MS * 10, LEVEL_1_DECAY_MS, LEVEL_2_DECAY_MS);

    expect(getMission().alertLevel).toBe(0);
  });
});
