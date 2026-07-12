import { describe, expect, it } from 'vitest';
import { AimDisplayState } from './AimDisplayState';

describe('aim display controller timing', () => {
  it('shows on right-stick engagement and fades for 150 ms after release', () => {
    const state = new AimDisplayState();

    expect(state.update({ dtMs: 16, controllerEngaged: true, mouseX: 0, mouseY: 0 })).toBe(1);
    expect(state.update({ dtMs: 75, controllerEngaged: false, mouseX: 0, mouseY: 0 })).toBeCloseTo(0.5);
    expect(state.update({ dtMs: 75, controllerEngaged: false, mouseX: 0, mouseY: 0 })).toBe(0);
  });
});

describe('aim display mouse timing', () => {
  it('holds for 650 ms after movement and fades over the next 150 ms', () => {
    const state = new AimDisplayState();

    expect(state.update({ dtMs: 16, controllerEngaged: false, mouseX: 10, mouseY: 10 })).toBe(0);
    expect(state.update({ dtMs: 16, controllerEngaged: false, mouseX: 11, mouseY: 10 })).toBe(1);
    expect(state.update({ dtMs: 650, controllerEngaged: false, mouseX: 11, mouseY: 10 })).toBe(1);
    expect(state.update({ dtMs: 75, controllerEngaged: false, mouseX: 11, mouseY: 10 })).toBeCloseTo(0.5);
    expect(state.update({ dtMs: 75, controllerEngaged: false, mouseX: 11, mouseY: 10 })).toBe(0);
  });

  it('keeps a stationary pointer hidden without prior movement', () => {
    const state = new AimDisplayState();

    expect(state.update({ dtMs: 16, controllerEngaged: false, mouseX: 40, mouseY: 24 })).toBe(0);
    expect(state.update({ dtMs: 1000, controllerEngaged: false, mouseX: 40, mouseY: 24 })).toBe(0);
  });
});
