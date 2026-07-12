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

  it('warns once after a real footstep decode failure settles and returns no fallback', async () => {
    const warn = vi.fn();
    const bank = new SampleBank(async () => new ArrayBuffer(1), async () => { throw new Error('bad'); }, warn);
    await bank.preload();
    expect(bank.choose('footstep:carpet')).toBeNull();
    expect(bank.choose('footstep:carpet')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns null silently while preload is still pending', async () => {
    const warn = vi.fn();
    let release!: (bytes: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((resolve) => { release = resolve; });
    const bank = new SampleBank(async () => pending, async () => ({}) as AudioBuffer, warn);
    const loading = bank.preload();
    expect(bank.choose('footstep:carpet')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    release(new ArrayBuffer(1));
    await loading;
  });
});
