import { describe, expect, it, vi } from 'vitest';
import { SharedGraph } from './sharedGraph';

describe('shared audio graph lifecycle', () => {
  it('reuses one graph and one set of ambience voices across five scene restarts', () => {
    const build = vi.fn(() => ({ ambienceVoiceCount: 5 }));
    const shared = new SharedGraph(build);

    const first = shared.getOrCreate();
    for (let restart = 0; restart < 5; restart += 1) {
      expect(shared.getOrCreate()).toBe(first);
    }

    expect(build).toHaveBeenCalledTimes(1);
    expect(first.ambienceVoiceCount).toBe(5);
  });
});
