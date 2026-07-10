import Phaser from 'phaser';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { NOISE_RING_TINT } from '../config/zones';
import { getSettings } from '../state/settings';
import type { Player } from '../entities/Player';
import type { MovementIntent } from '../input/InputState';

/** Guard readouts shown in the HUD when the guard debug view (H) is on. */
export interface GuardHudInfo {
  state: string;
  suspicion: number;
  sees: boolean;
  spotted: number;
  detains: number;
}

/** Extra HUD data beyond the player's own movement readouts. */
export interface HudExtra {
  /** Bolts remaining this run. Always shown. */
  bolts: number;
  /** Building alert status line, e.g. "CALM". Always shown. */
  site: string;
  /** Light level at the player as a percentage, shown only in guard debug. */
  light: number | null;
  /** Guard readouts, shown only when the guard debug view is on. */
  guard: GuardHudInfo | null;
  /** Door state lines, shown only when the guard debug view is on. */
  doors: string[] | null;
  /** Camera state lines, shown only when the guard debug view is on. */
  cameras: string[] | null;
}

/** The site line drives the panel trim colour. Red stays detection-only. */
const SITE_TRIM: Record<string, { tint: number; alpha: number }> = {
  CALM: { tint: PALETTE_HEX.amber, alpha: 0.35 },
  CAUTIOUS: { tint: PALETTE_HEX.amber, alpha: 0.95 },
  LOCKDOWN: { tint: PALETTE_HEX.alarm, alpha: 0.95 },
};

/**
 * The mission HUD, plus the player's noise ring. Styled as a slim field
 * readout on the corporate artefact system: dark chip, amber trim, IBM Plex
 * Mono, sitting top left like a badge clipped to the screen. The trim tracks
 * the site state (word first, colour second, never colour alone).
 *
 * In dev builds it doubles as the debug view: the input device line, the
 * G/H/L toggle hints and, when the guard view is on, guard, door and camera
 * internals. None of that ships to production.
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly trim: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.ring = scene.add.graphics().setDepth(30);

    this.panel = scene.add
      .rectangle(8, 8, 178, 88, 0x11161d, 0.88)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.35);
    this.trim = scene.add
      .rectangle(8, 8, 3, 88, PALETTE_HEX.amber, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999);

    this.text = scene.add
      .text(22, 17, '', {
        fontFamily: FONTS.mono,
        fontSize: '14px',
        color: PALETTE.text,
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** Every screen-fixed piece, so secondary feed cameras can ignore them. */
  get screenObjects(): Phaser.GameObjects.GameObject[] {
    return [this.panel, this.trim, this.text];
  }

  update(player: Player, intent: MovementIntent, extra: HudExtra): void {
    // The HUD text scale setting applies live, so a change from the pause menu
    // takes effect the moment the player resumes. The ring is world space and
    // is not scaled.
    this.text.setScale(getSettings().hudScale);

    this.ring.clear();
    if (player.noiseRadius > 0) {
      this.ring.lineStyle(2, NOISE_RING_TINT, 0.8);
      this.ring.strokeCircle(player.x, player.y, player.noiseRadius);
    }

    const lines = [
      `SPEED   ${intent.speed.toUpperCase()}`,
      `NOISE   ${player.noiseRadius} px`,
      `BOLTS   ${extra.bolts}`,
      `SITE    ${extra.site}`,
    ];
    if (import.meta.env.DEV) {
      lines.push(`DEVICE  ${intent.device.toUpperCase()}`, `[G] grid  [H] guard  [L] lights`);
    }
    if (extra.guard) {
      lines.push(
        '',
        `GUARD   ${extra.guard.state.toUpperCase()}`,
        `SUSP    ${Math.round(extra.guard.suspicion)}%`,
        `SEES    ${extra.guard.sees ? 'YES' : 'no'}`,
        `LIGHT   ${extra.light ?? 0}%`,
        `SPOTS   ${extra.guard.spotted}`,
        `CATCH   ${extra.guard.detains}`
      );
    }
    if (extra.doors) {
      lines.push('', ...extra.doors);
    }
    if (extra.cameras) {
      lines.push('', ...extra.cameras);
    }
    this.text.setText(lines);

    // Fit the chip to the text and colour the trim from the site state.
    this.panel.setSize(Math.max(178, this.text.displayWidth + 28), this.text.displayHeight + 18);
    this.trim.setSize(3, this.panel.height);
    const trim = SITE_TRIM[extra.site] ?? SITE_TRIM.CALM;
    this.panel.setStrokeStyle(1, trim.tint, trim.alpha);
    this.trim.setFillStyle(trim.tint, trim.alpha);
  }
}
