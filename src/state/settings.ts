/**
 * Player settings, a module-level singleton so every system reads the same
 * values and they survive scene restarts. Persisted to localStorage under one
 * key, per the CLAUDE.md "localStorage for settings only" rule. Phase 6 adds the
 * menu UI; the plumbing (including the screen-shake / flash toggle) is here now.
 */
interface Settings {
  /**
   * Screen shake on alarm AND the DETAINED camera flash. One toggle covers both
   * sudden-motion effects, for photosensitivity and nystagmus comfort. Default on.
   */
  screenShake: boolean;
  /** Master audio volume, 0 to 1. */
  masterVolume: number;
  /** Global mute. */
  muted: boolean;
  /** Multiplier on HUD text size, for the accessibility menu. */
  hudScale: number;
  /** Extra brightness on top of the lighting visibility floor, 0 to 1. */
  extraBrightness: number;
  /**
   * Assist mode: guards move at a reduced speed. No score penalty and no shame
   * copy anywhere, per the accessibility design. Default off.
   */
  assistMode: boolean;
}

const STORAGE_KEY = 'tailgate.settings';

const settings: Settings = {
  screenShake: true,
  masterVolume: 0.8,
  muted: false,
  hudScale: 1,
  extraBrightness: 0,
  assistMode: false,
};

// Load any persisted overrides. Guarded so a headless build never throws.
try {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (raw) {
    Object.assign(settings, JSON.parse(raw) as Partial<Settings>);
  }
} catch {
  // No storage available; defaults stand.
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; the in-memory settings still apply.
  }
}

export function getSettings(): Readonly<Settings> {
  return settings;
}

export function setScreenShake(on: boolean): void {
  settings.screenShake = on;
  persist();
}

export function setMasterVolume(v: number): void {
  settings.masterVolume = Math.max(0, Math.min(1, v));
  persist();
}

export function setMuted(muted: boolean): void {
  settings.muted = muted;
  persist();
}

export function setHudScale(v: number): void {
  settings.hudScale = v;
  persist();
}

export function setExtraBrightness(v: number): void {
  settings.extraBrightness = Math.max(0, Math.min(1, v));
  persist();
}

export function setAssistMode(on: boolean): void {
  settings.assistMode = on;
  persist();
}
