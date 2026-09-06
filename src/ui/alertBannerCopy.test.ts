import { describe, expect, it } from 'vitest';
import { alertBannerCopy } from './alertBannerCopy';

describe('alertBannerCopy', () => {
  it('names a lockdown as a lockdown wherever it came from', () => {
    expect(alertBannerCopy(2, 1).tone).toBe('lockdown');
    expect(alertBannerCopy(2, 0).heading).toBe('SITE LOCKDOWN');
  });

  it('tells a raised alert apart from a lifted lockdown', () => {
    expect(alertBannerCopy(1, 0).heading).toBe('SITE ALERT RAISED');
    expect(alertBannerCopy(1, 2).heading).toBe('LOCKDOWN LIFTED');
    expect(alertBannerCopy(1, 2).tone).toBe('cautious');
  });

  it('reads calm as standing down', () => {
    const copy = alertBannerCopy(0, 1);
    expect(copy.tone).toBe('calm');
    expect(copy.heading).toBe('SITE STANDING DOWN');
  });

  it('keeps every line free of em-dashes', () => {
    for (const [level, previous] of [[2, 0], [1, 0], [1, 2], [0, 1]]) {
      const copy = alertBannerCopy(level, previous);
      expect(copy.heading + copy.detail).not.toContain('—');
    }
  });
});
