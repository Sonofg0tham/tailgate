import { describe, expect, it, vi } from 'vitest';
import { SampleBank } from './SampleBank';

describe('SampleBank decode failure policy', () => {
  it('settles failed optional decodes and warns only once', async () => {
    const warn = vi.fn();
    const bank = new SampleBank(async () => new ArrayBuffer(1), async () => { throw new Error('bad ogg'); }, warn);
    await expect(bank.preload()).resolves.toBeUndefined();
    await expect(bank.preload()).resolves.toBeUndefined();
    expect(bank.available('door-latch')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns once when an unavailable optional footstep is requested and returns no fallback', () => {
    const warn = vi.fn();
    const bank = new SampleBank(async () => new ArrayBuffer(1), async () => { throw new Error('bad'); }, warn);
    expect(bank.choose('footstep:carpet')).toBeNull();
    expect(bank.choose('footstep:carpet')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
