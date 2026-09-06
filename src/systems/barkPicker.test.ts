import { describe, expect, it } from 'vitest';
import { BARKS } from '../config/barks';
import { pickBark } from './barkPicker';

describe('pickBark', () => {
  it('returns null for an empty list', () => {
    expect(pickBark([], null, () => 0)).toBeNull();
  });

  it('never repeats the line just said when there is a choice', () => {
    const lines = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i += 1) {
      const pick = pickBark(lines, 'b', () => i / 20);
      expect(pick).not.toBe('b');
      expect(lines).toContain(pick);
    }
  });

  it('repeats a single line rather than falling silent', () => {
    expect(pickBark(['only'], 'only', () => 0.9)).toBe('only');
  });

  it('clamps a random of exactly 1 inside the pool', () => {
    expect(pickBark(['a', 'b'], null, () => 1)).toBe('b');
  });

  it('has copy for every bark event', () => {
    for (const lines of Object.values(BARKS)) {
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        // The project bans em-dashes everywhere, copy included.
        expect(line).not.toContain('—');
      }
    }
  });
});
