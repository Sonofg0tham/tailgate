/**
 * Tailgate visual identity, defined in CLAUDE.md. Non-negotiable.
 * Alarm red is reserved exclusively for detection and alarm states.
 */
export const PALETTE = {
  /** Near-black base. */
  base: '#0E1116',
  /** Clearance amber, the primary accent. */
  amber: '#FFB000',
  /** Cool grey UI text. */
  text: '#C7CDD4',
  /** Detection and alarm states ONLY. If red appears, the player is in trouble. */
  alarm: '#FF3B30',
} as const;

/** Same colours as numbers, for Phaser fill/tint APIs. */
export const PALETTE_HEX = {
  base: 0x0e1116,
  amber: 0xffb000,
  text: 0xc7cdd4,
  alarm: 0xff3b30,
} as const;

export const FONTS = {
  /** Display font for menus and headings. */
  display: '"Saira Condensed", sans-serif',
  /** Monospace for HUD readouts and the Engagement Report. */
  mono: '"IBM Plex Mono", monospace',
} as const;
