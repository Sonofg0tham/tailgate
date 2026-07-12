import { describe, expect, it } from 'vitest';
import { AimDisplayState } from './AimDisplayState';

describe('aim display controller timing', () => {
  it('keeps the last controller aim stable through the 150 ms release fade', () => {
    const state = new AimDisplayState();

    expect(
      state.update({
        dtMs: 16,
        controllerEngaged: true,
        mouseX: 0,
        mouseY: 0,
        aimX: 120,
        aimY: 80,
      })
    ).toEqual({ alpha: 1, aimX: 120, aimY: 80 });
    expect(
      state.update({
        dtMs: 75,
        controllerEngaged: false,
        mouseX: 0,
        mouseY: 0,
        aimX: 500,
        aimY: 400,
      })
    ).toEqual({ alpha: 0.5, aimX: 120, aimY: 80 });
  });

  it('lets genuine mouse movement take presentation ownership immediately', () => {
    const state = new AimDisplayState();
    state.update({
      dtMs: 16,
      controllerEngaged: true,
      mouseX: 10,
      mouseY: 10,
      aimX: 120,
      aimY: 80,
    });

    expect(
      state.update({
        dtMs: 16,
        controllerEngaged: false,
        mouseX: 11,
        mouseY: 10,
        aimX: 500,
        aimY: 400,
      })
    ).toEqual({ alpha: 1, aimX: 500, aimY: 400 });
  });
});

describe('aim display mouse timing', () => {
  it('holds for 650 ms after movement and fades over the next 150 ms', () => {
    const state = new AimDisplayState();

    const base = { controllerEngaged: false, aimX: 400, aimY: 300 };
    expect(state.update({ ...base, dtMs: 16, mouseX: 10, mouseY: 10 }).alpha).toBe(0);
    expect(state.update({ ...base, dtMs: 16, mouseX: 11, mouseY: 10 }).alpha).toBe(1);
    expect(state.update({ ...base, dtMs: 650, mouseX: 11, mouseY: 10 }).alpha).toBe(1);
    expect(state.update({ ...base, dtMs: 75, mouseX: 11, mouseY: 10 }).alpha).toBeCloseTo(0.5);
    expect(state.update({ ...base, dtMs: 75, mouseX: 11, mouseY: 10 }).alpha).toBe(0);
  });

  it('keeps a stationary pointer hidden without prior movement', () => {
    const state = new AimDisplayState();

    const base = { controllerEngaged: false, aimX: 400, aimY: 300, mouseX: 40, mouseY: 24 };
    expect(state.update({ ...base, dtMs: 16 }).alpha).toBe(0);
    expect(state.update({ ...base, dtMs: 1000 }).alpha).toBe(0);
  });
});
