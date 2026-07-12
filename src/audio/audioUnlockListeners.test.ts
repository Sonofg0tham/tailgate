import { describe, expect, it, vi } from 'vitest';
import { AudioUnlockListeners, type UnlockEventTarget } from './audioUnlockListeners';

function target(): UnlockEventTarget & { emit: (event: string) => void; count: (event: string) => number } {
  const handlers = new Map<string, Set<() => void>>();
  return {
    on: (event, fn) => { const set = handlers.get(event) ?? new Set(); set.add(fn); handlers.set(event, set); },
    off: (event, fn) => { handlers.get(event)?.delete(fn); },
    emit: (event) => { for (const fn of [...(handlers.get(event) ?? [])]) fn(); },
    count: (event) => handlers.get(event)?.size ?? 0,
  };
}

describe('audio unlock listeners', () => {
  it('unlocks from a controller button and removes every input listener', () => {
    const pointer = target();
    const keyboard = target();
    const gamepad = target();
    const unlock = vi.fn();
    const listeners = new AudioUnlockListeners(unlock);
    listeners.arm(pointer, keyboard, gamepad);
    gamepad.emit('down');
    pointer.emit('pointerdown');
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(pointer.count('pointerdown')).toBe(0);
    expect(keyboard.count('keydown')).toBe(0);
    expect(gamepad.count('down')).toBe(0);
  });

  it('does not duplicate handlers when armed again and cleans up on shutdown', () => {
    const pointer = target();
    const gamepad = target();
    const listeners = new AudioUnlockListeners(vi.fn());
    listeners.arm(pointer, undefined, gamepad);
    listeners.arm(pointer, undefined, gamepad);
    expect(gamepad.count('down')).toBe(1);
    listeners.dispose();
    expect(pointer.count('pointerdown')).toBe(0);
    expect(gamepad.count('down')).toBe(0);
  });
});
