import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';
import { NOISE_RING_TINT } from '../config/zones';
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
  /** Guard readouts, shown only when the guard debug view is on. */
  guard: GuardHudInfo | null;
  /** Door state lines, shown only when the guard debug view is on. */
  doors: string[] | null;
}

/**
 * The debug view. Two jobs:
 *  - draw the player's noise radius as a ring that grows with speed (this is the
 *    visible proof the movement state machine works),
 *  - print the current speed, noise value, active input device, and, when the
 *    guard debug toggle is on, the guard's state and suspicion.
 *
 * The ring lives in world space (depth 30, under the player at 40). The text is
 * pinned to the screen so it does not scroll with the camera.
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.ring = scene.add.graphics().setDepth(30);

    this.text = scene.add
      .text(12, 12, '', {
        fontFamily: FONTS.mono,
        fontSize: '14px',
        color: PALETTE.text,
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(player: Player, intent: MovementIntent, extra: HudExtra): void {
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
      `DEVICE  ${intent.device.toUpperCase()}`,
      `[G] grid   [H] guard`,
    ];
    if (extra.guard) {
      lines.push(
        '',
        `GUARD   ${extra.guard.state.toUpperCase()}`,
        `SUSP    ${Math.round(extra.guard.suspicion)}%`,
        `SEES    ${extra.guard.sees ? 'YES' : 'no'}`,
        `SPOTS   ${extra.guard.spotted}`,
        `CATCH   ${extra.guard.detains}`
      );
    }
    if (extra.doors) {
      lines.push('', ...extra.doors);
    }
    this.text.setText(lines);
  }
}
