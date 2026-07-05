import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';
import { NOISE_RING_TINT } from '../config/zones';
import type { Player } from '../entities/Player';
import type { MovementIntent } from '../input/InputState';

/**
 * The Phase 1 debug view. Two jobs:
 *  - draw the player's noise radius as a ring that grows with speed (this is the
 *    visible proof the movement state machine works),
 *  - print the current speed, noise value and active input device.
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

  update(player: Player, intent: MovementIntent): void {
    this.ring.clear();
    if (player.noiseRadius > 0) {
      this.ring.lineStyle(2, NOISE_RING_TINT, 0.8);
      this.ring.strokeCircle(player.x, player.y, player.noiseRadius);
    }

    this.text.setText([
      `SPEED   ${intent.speed.toUpperCase()}`,
      `NOISE   ${player.noiseRadius} px`,
      `DEVICE  ${intent.device.toUpperCase()}`,
    ]);
  }
}
