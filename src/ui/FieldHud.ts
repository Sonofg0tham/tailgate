import Phaser from 'phaser';
import { HUD } from '../config/hud';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { getSettings } from '../state/settings';
import type { SpeedState } from '../input/InputState';

/** Everything the HUD shows this frame. The scene builds it from live state. */
export interface HudFrame {
  pace: SpeedState;
  /** The player's noise radius now and the loudest it can be, px. */
  noiseRadiusPx: number;
  noiseMaxPx: number;
  bolts: number;
  boltsMax: number;
  /** Building alert status line, e.g. "CALM". */
  site: string;
  /** How lit the player is, 0 dark to 1 lit. */
  exposure: number;
  /** The current objective heading and the venue-specific line under it. */
  objective: { heading: string; detail: string };
  evidence: { done: number; total: number };
  disguise: 'none' | 'worn' | 'blown';
  /** Looped camera feeds still running, for the countdown chip. */
  loops: { id: string; secondsLeft: number }[];
  /** Dev-build extras: the input device line and any debug readouts. */
  dev: { device: string; lines: string[] } | null;
}

/** The site line drives the trim colour. Red stays detection-only. */
const SITE_TRIM: Record<string, { tint: number; alpha: number }> = {
  CALM: { tint: PALETTE_HEX.amber, alpha: 0.35 },
  CAUTIOUS: { tint: PALETTE_HEX.amber, alpha: 0.95 },
  LOCKDOWN: { tint: PALETTE_HEX.alarm, alpha: 0.95 },
};

/** Fixed row order in the left chip, so the bars know where to draw. */
const LEFT_ROWS = { site: 0, pace: 1, exposure: 2, bolts: 3 } as const;
/** Where the value column starts inside the chips, px from the text origin. */
const VALUE_COL = 84;

/**
 * The mission HUD (Phase 21), on the corporate artefact system: two slim
 * field-readout chips clipped to the top corners, dark sheet, amber trim,
 * IBM Plex Mono. Left is the consultant's own state (site alert, pace and
 * noise, how lit they are, bolts). Right is the job (objective, evidence,
 * hi-vis). A third chip appears under the left one while a feed is looped.
 *
 * Every reading pairs a word with its bar or pips, so nothing is colour or
 * length alone. In dev builds the left chip also carries the input device
 * and the G/H/L debug lines; none of that ships to production.
 */
export class FieldHud {
  private readonly leftPanel: Phaser.GameObjects.Rectangle;
  private readonly leftTrim: Phaser.GameObjects.Rectangle;
  private readonly leftText: Phaser.GameObjects.Text;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly rightPanel: Phaser.GameObjects.Rectangle;
  private readonly rightText: Phaser.GameObjects.Text;
  private readonly loopPanel: Phaser.GameObjects.Rectangle;
  private readonly loopText: Phaser.GameObjects.Text;
  private readonly screenWidth: number;

  constructor(scene: Phaser.Scene) {
    const { marginPx, padX, padY, fontPx, leftWidthPx, fillAlpha } = HUD.chip;
    this.screenWidth = scene.scale.width;

    this.leftPanel = scene.add
      .rectangle(marginPx, marginPx, leftWidthPx, 88, PALETTE_HEX.sheet, fillAlpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.35);
    this.leftTrim = scene.add
      .rectangle(marginPx, marginPx, 3, 88, PALETTE_HEX.amber, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999);
    this.leftText = scene.add
      .text(marginPx + padX + 2, marginPx + padY, '', {
        fontFamily: FONTS.mono,
        fontSize: `${fontPx}px`,
        color: PALETTE.text,
        lineSpacing: HUD.chip.rowPx - fontPx - 2,
      })
      .setScrollFactor(0)
      .setDepth(1000);
    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    this.rightPanel = scene.add
      .rectangle(this.screenWidth - marginPx, marginPx, 200, 60, PALETTE_HEX.sheet, fillAlpha)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(999)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.35);
    this.rightText = scene.add
      .text(0, marginPx + padY, '', {
        fontFamily: FONTS.mono,
        fontSize: `${fontPx}px`,
        color: PALETTE.text,
        lineSpacing: HUD.chip.rowPx - fontPx - 2,
      })
      .setScrollFactor(0)
      .setDepth(1000);

    // The loop chip: only visible while a camera feed is looped, so the
    // countdown is on screen where the sneaking happens.
    this.loopPanel = scene.add
      .rectangle(marginPx, marginPx, leftWidthPx, 24, PALETTE_HEX.sheet, fillAlpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(999)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.95)
      .setVisible(false);
    this.loopText = scene.add
      .text(marginPx + padX + 2, marginPx, '', {
        fontFamily: FONTS.mono,
        fontSize: '13px',
        color: PALETTE.amber,
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
  }

  /** Every screen-fixed piece, so secondary feed cameras can ignore them. */
  get screenObjects(): Phaser.GameObjects.GameObject[] {
    return [
      this.leftPanel,
      this.leftTrim,
      this.leftText,
      this.bars,
      this.rightPanel,
      this.rightText,
      this.loopPanel,
      this.loopText,
    ];
  }

  update(frame: HudFrame): void {
    // The HUD text scale setting applies live, so a change from the pause
    // menu takes effect the moment the player resumes.
    const scale = getSettings().hudScale;
    this.leftText.setScale(scale);
    this.rightText.setScale(scale);
    this.loopText.setScale(scale);

    this.updateLeft(frame, scale);
    this.updateRight(frame);
    this.updateLoops(frame, scale);
  }

  private updateLeft(frame: HudFrame, scale: number): void {
    const { marginPx, padX, padY, rowPx, leftWidthPx } = HUD.chip;
    const exposureWord = FieldHud.exposureWord(frame.exposure);
    const lines = [
      `SITE      ${frame.site}`,
      `PACE      ${HUD.pace[frame.pace]}`,
      `EXPOSURE  ${exposureWord}`,
      `BOLTS`,
    ];
    if (frame.dev) {
      lines.push(`DEVICE    ${frame.dev.device.toUpperCase()}`, '[G] grid  [H] guard  [L] lights');
      if (frame.dev.lines.length > 0) {
        lines.push('', ...frame.dev.lines);
      }
    }
    this.leftText.setText(lines);

    const width = Math.max(leftWidthPx, this.leftText.displayWidth + padX * 2 + 6);
    const height = this.leftText.displayHeight + padY * 2;
    this.leftPanel.setSize(width, height);
    this.leftTrim.setSize(3, height);
    const trim = SITE_TRIM[frame.site] ?? SITE_TRIM.CALM;
    this.leftPanel.setStrokeStyle(1, trim.tint, trim.alpha);
    this.leftTrim.setFillStyle(trim.tint, trim.alpha);

    // The bars and pips, drawn beside their rows. The value column and rows
    // scale with the text, so the setting moves them together.
    const originX = marginPx + padX + 2;
    const originY = marginPx + padY;
    const rowY = (row: number) => originY + (row * rowPx + rowPx / 2 - 1) * scale;
    const barX = originX + (VALUE_COL + 58) * scale;
    this.bars.clear();
    this.drawBar(
      barX,
      rowY(LEFT_ROWS.pace),
      Phaser.Math.Clamp(frame.noiseRadiusPx / Math.max(1, frame.noiseMaxPx), 0, 1),
      scale
    );
    this.drawBar(barX, rowY(LEFT_ROWS.exposure), Phaser.Math.Clamp(frame.exposure, 0, 1), scale);
    this.drawPips(originX + VALUE_COL * scale, rowY(LEFT_ROWS.bolts), frame.bolts, frame.boltsMax, scale);
  }

  private updateRight(frame: HudFrame): void {
    const { marginPx, padX, padY } = HUD.chip;
    const lines = [
      `OBJECTIVE  ${frame.objective.heading}`,
      `           ${frame.objective.detail}`,
      `${HUD.objective.evidence.padEnd(11)}${frame.evidence.done} OF ${frame.evidence.total}`,
    ];
    if (frame.disguise === 'worn') {
      lines.push('HI-VIS     WORN');
    } else if (frame.disguise === 'blown') {
      lines.push('HI-VIS     BLOWN');
    }
    this.rightText.setText(lines);
    const width = this.rightText.displayWidth + padX * 2 + 4;
    const height = this.rightText.displayHeight + padY * 2;
    this.rightPanel.setSize(width, height);
    this.rightText.setX(this.screenWidth - marginPx - width + padX + 2);
  }

  private updateLoops(frame: HudFrame, scale: number): void {
    const { marginPx, padX, leftWidthPx } = HUD.chip;
    const looping = frame.loops.length > 0;
    this.loopPanel.setVisible(looping);
    this.loopText.setVisible(looping);
    if (!looping) {
      return;
    }
    this.loopText.setText(
      frame.loops.map((l) => `CAM LOOP  ${l.id.toUpperCase()}  ${l.secondsLeft}s`)
    );
    const chipY = marginPx + this.leftPanel.height + 6;
    this.loopPanel.setY(chipY);
    this.loopText.setY(chipY + 8 * scale);
    this.loopPanel.setSize(
      Math.max(leftWidthPx, this.loopText.displayWidth + padX * 2 + 6),
      this.loopText.displayHeight + 16 * scale
    );
  }

  /** A slim track with an amber fill, its left edge at x, centred on y. */
  private drawBar(x: number, y: number, fill: number, scale: number): void {
    const w = HUD.bar.widthPx * scale;
    const h = HUD.bar.heightPx * scale;
    this.bars.fillStyle(PALETTE_HEX.text, HUD.bar.trackAlpha);
    this.bars.fillRect(x, y - h / 2, w, h);
    if (fill > 0) {
      this.bars.fillStyle(PALETTE_HEX.amber, 0.95);
      this.bars.fillRect(x, y - h / 2, Math.max(2, w * fill), h);
    }
  }

  /** One diamond per bolt: filled while it is still in the pocket. */
  private drawPips(x: number, y: number, left: number, max: number, scale: number): void {
    const r = HUD.pips.sizePx * scale;
    for (let i = 0; i < max; i += 1) {
      const cx = x + i * HUD.pips.gapPx * scale + r;
      const points = [
        new Phaser.Math.Vector2(cx, y - r),
        new Phaser.Math.Vector2(cx + r, y),
        new Phaser.Math.Vector2(cx, y + r),
        new Phaser.Math.Vector2(cx - r, y),
      ];
      if (i < left) {
        this.bars.fillStyle(PALETTE_HEX.amber, 0.95);
        this.bars.fillPoints(points, true);
      } else {
        this.bars.lineStyle(1, PALETTE_HEX.text, 0.45);
        this.bars.strokePoints(points, true);
      }
    }
  }

  /** The exposure word, so the reading is never the bar alone. */
  static exposureWord(exposure: number): string {
    const { dimAbove, litAbove, words } = HUD.exposure;
    if (exposure >= litAbove) {
      return words.lit;
    }
    if (exposure >= dimAbove) {
      return words.dim;
    }
    return words.hidden;
  }
}
