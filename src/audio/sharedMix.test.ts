import { describe, expect, it, vi } from 'vitest';
import { buildMixCore, SharedMixLifecycle } from './sharedMix';

interface FakeParam {
  value: number;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

function fakeParam(value = 0): FakeParam {
  return {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(function (this: FakeParam, next: number) { this.value = next; }),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function fakeContext() {
  const destination = { name: 'destination' };
  const nodes: Array<{ name: string; gain?: FakeParam; connect: ReturnType<typeof vi.fn> }> = [];
  const makeNode = (name: string, gain?: FakeParam) => {
    const node = { name, gain, connect: vi.fn() };
    nodes.push(node);
    return node;
  };
  return {
    currentTime: 2,
    destination,
    nodes,
    createGain: vi.fn(() => makeNode('gain', fakeParam(1))),
    createDynamicsCompressor: vi.fn(() => ({
      ...makeNode('compressor'),
      threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(),
      attack: fakeParam(), release: fakeParam(),
    })),
  };
}

describe('shared audio mix', () => {
  it('places headroom and master gain before the final compressor', () => {
    const ctx = fakeContext();
    const mix = buildMixCore(ctx as unknown as AudioContext, false);

    expect(mix.sharedGain.connect).toHaveBeenCalledWith(mix.masterGain);
    expect(mix.masterGain.connect).toHaveBeenCalledWith(mix.compressor);
    expect(mix.compressor.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('reuses the same built mix and ramps pause without rebuilding', () => {
    const ctx = fakeContext() as unknown as AudioContext;
    const build = vi.fn((audioContext: AudioContext) => buildMixCore(audioContext, false));
    const lifecycle = new SharedMixLifecycle(build);
    const first = lifecycle.getOrCreate(ctx);

    lifecycle.setGameplayPaused(true);
    const second = lifecycle.getOrCreate(ctx);

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(first.sharedGain.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });
});
