import Phaser from 'phaser';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';

/**
 * Phase 0 placeholder: a clearance-amber rectangle patrolling the screen,
 * plus an FPS readout so the 60fps acceptance check is visible on the page.
 * Replaced by the real game scenes from Phase 1 onwards.
 */
export class PlaceholderScene extends Phaser.Scene {
  private box!: Phaser.GameObjects.Rectangle;
  private fpsText!: Phaser.GameObjects.Text;
  private readonly velocity = new Phaser.Math.Vector2(220, 160);

  constructor() {
    super('placeholder');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 72, 'TAILGATE', {
        fontFamily: FONTS.display,
        fontSize: '56px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 116, 'PHASE 0 // SITE SURVEY IN PROGRESS', {
        fontFamily: FONTS.mono,
        fontSize: '14px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5);

    this.box = this.add.rectangle(width / 2, height / 2 + 40, 48, 48, PALETTE_HEX.amber);

    this.fpsText = this.add.text(12, 12, '', {
      fontFamily: FONTS.mono,
      fontSize: '12px',
      color: PALETTE.text,
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const half = this.box.width / 2;

    this.box.x += this.velocity.x * dt;
    this.box.y += this.velocity.y * dt;

    if (this.box.x <= half || this.box.x >= width - half) {
      this.velocity.x *= -1;
      this.box.x = Phaser.Math.Clamp(this.box.x, half, width - half);
    }
    if (this.box.y <= 160 + half || this.box.y >= height - half) {
      this.velocity.y *= -1;
      this.box.y = Phaser.Math.Clamp(this.box.y, 160 + half, height - half);
    }

    this.fpsText.setText(`FPS ${Math.round(this.game.loop.actualFps)}`);
  }
}
