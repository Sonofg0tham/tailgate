import Phaser from 'phaser';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { getSettings } from '../state/settings';
import { alertBannerCopy, type BannerTone } from './alertBannerCopy';

/** Banner timing. One-shot, eased, and gone before it can nag. */
const BANNER = {
  y: 46,
  width: 470,
  height: 50,
  fadeInMs: 220,
  holdMs: 2600,
  fadeOutMs: 600,
  /** How far the strip slides down as it appears, px. Small and slow. */
  slidePx: 8,
} as const;

/** Text and trim colour per tone. Red only for lockdown, a detection state. */
const TONE_COLOURS: Record<BannerTone, { text: string; trim: number }> = {
  calm: { text: PALETTE.text, trim: PALETTE_HEX.text },
  cautious: { text: PALETTE.amber, trim: PALETTE_HEX.amber },
  lockdown: { text: PALETTE.alarm, trim: PALETTE_HEX.alarm },
};

/**
 * The site-alert banner (Phase 21): a strip that eases in under the top of
 * the screen whenever the building's alert level changes, says what
 * happened in words, and fades out on its own. The HUD chip still carries
 * the live state; this is the moment of change, which used to be a shake
 * and a colour and nothing else.
 *
 * Reveals are one-shot, so it plays with SCREEN EFFECTS off as well, but the
 * slide is skipped then: the strip simply fades.
 */
export class AlertBanner {
  private readonly scene: Phaser.Scene;
  private readonly group: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly trim: Phaser.GameObjects.Rectangle;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = scene.scale.width / 2;
    this.panel = scene.add
      .rectangle(0, 0, BANNER.width, BANNER.height, PALETTE_HEX.sheet, 0.92)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.9);
    this.trim = scene.add.rectangle(-BANNER.width / 2, 0, 4, BANNER.height, PALETTE_HEX.amber, 0.95).setOrigin(0, 0.5);
    this.heading = scene.add
      .text(0, -9, '', { fontFamily: FONTS.display, fontSize: '22px', color: PALETTE.amber })
      .setOrigin(0.5);
    this.detail = scene.add
      .text(0, 13, '', { fontFamily: FONTS.mono, fontSize: '11px', color: PALETTE.text })
      .setOrigin(0.5);
    this.group = scene.add
      .container(cx, BANNER.y, [this.panel, this.trim, this.heading, this.detail])
      .setScrollFactor(0)
      .setDepth(1100)
      .setAlpha(0);
  }

  /** Every screen-fixed piece, so secondary feed cameras can ignore them. */
  get screenObjects(): Phaser.GameObjects.GameObject[] {
    return [this.group];
  }

  /** Shows the change from `previous` to `level`. Replaces any banner still up. */
  show(level: number, previous: number): void {
    const copy = alertBannerCopy(level, previous);
    const colours = TONE_COLOURS[copy.tone];
    this.heading.setText(copy.heading).setColor(colours.text);
    this.detail.setText(copy.detail);
    this.panel.setStrokeStyle(1, colours.trim, 0.9);
    this.trim.setFillStyle(colours.trim, 0.95);

    this.scene.tweens.killTweensOf(this.group);
    const slide = getSettings().screenEffects ? BANNER.slidePx : 0;
    this.group.setAlpha(0).setY(BANNER.y - slide);
    this.scene.tweens.add({
      targets: this.group,
      alpha: 1,
      y: BANNER.y,
      duration: BANNER.fadeInMs,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.group,
          alpha: 0,
          delay: BANNER.holdMs,
          duration: BANNER.fadeOutMs,
          ease: 'Quad.easeIn',
        });
      },
    });
  }
}
