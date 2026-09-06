/**
 * The words on the site-alert banner (Phase 21). Pure, so the copy can be
 * unit tested: given where the alert level went from and to, what the
 * banner says and which tone it takes. Tone is the shape and colour pairing
 * the banner draws with; the text always carries the state on its own.
 */
export type BannerTone = 'calm' | 'cautious' | 'lockdown';

export interface BannerCopy {
  heading: string;
  detail: string;
  tone: BannerTone;
}

export function alertBannerCopy(level: number, previous: number): BannerCopy {
  if (level >= 2) {
    return {
      heading: 'SITE LOCKDOWN',
      detail: 'BADGE DOORS SEALED. GUARDS SWEEPING THE FLOOR.',
      tone: 'lockdown',
    };
  }
  if (level === 1) {
    if (previous >= 2) {
      return {
        heading: 'LOCKDOWN LIFTED',
        detail: 'SITE STILL CAUTIOUS. BADGE DOORS BACK IN SERVICE.',
        tone: 'cautious',
      };
    }
    return {
      heading: 'SITE ALERT RAISED',
      detail: 'GUARDS MOVING FASTER ON WIDER ROUNDS.',
      tone: 'cautious',
    };
  }
  return {
    heading: 'SITE STANDING DOWN',
    detail: 'ROUTINES RESUMED. NOBODY IS LOOKING FOR YOU.',
    tone: 'calm',
  };
}
