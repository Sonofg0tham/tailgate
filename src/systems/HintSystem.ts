import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';
import { READABILITY } from '../config/readability';
import { getSettings } from '../state/settings';
import type { LevelHint } from '../state/levels';
import { hasSeenHint, markHintSeen } from '../state/progress';

/**
 * First-run contextual hints: consultant's notes that surface once, ever, the
 * first time the player walks near a point of interest. The definitions live
 * in each level's entry in levels.json (position, radius, one line of copy);
 * the once-per-profile flags persist with campaign progress, so a hint never
 * nags a player who has already read it.
 *
 * Display is deliberately quiet: one grey line above the mission prompt, no
 * chrome, gone after a few seconds or when the player walks on. Hints teach;
 * they must never feel like an alarm.
 */
export class HintSystem {
  private readonly levelId: string;
  private readonly hints: readonly LevelHint[];
  private readonly text: Phaser.GameObjects.Text;
  private active: { hint: LevelHint; shownAt: number } | null = null;

  constructor(scene: Phaser.Scene, levelId: string, hints: readonly LevelHint[]) {
    this.levelId = levelId;
    this.hints = hints;
    this.text = scene.add
      .text(scene.scale.width / 2, scene.scale.height - 52, '', {
        fontFamily: FONTS.mono,
        fontSize: `${READABILITY.hints.textSizePx}px`,
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** The text object, so secondary feed cameras can ignore it. */
  get gameObject(): Phaser.GameObjects.Text {
    return this.text;
  }

  update(now: number, playerX: number, playerY: number): void {
    this.text.setScale(getSettings().hudScale);

    if (this.active) {
      const { hint, shownAt } = this.active;
      const inRange =
        Phaser.Math.Distance.Between(playerX, playerY, hint.x, hint.y) <= hint.radiusPx;
      if (!inRange || now - shownAt >= READABILITY.hints.showForMs) {
        this.active = null;
        this.text.setText('');
      }
      return;
    }

    for (const hint of this.hints) {
      if (hasSeenHint(this.levelId, hint.id)) {
        continue;
      }
      if (Phaser.Math.Distance.Between(playerX, playerY, hint.x, hint.y) <= hint.radiusPx) {
        // Marked seen the moment it shows: once per profile means exactly once.
        markHintSeen(this.levelId, hint.id);
        this.active = { hint, shownAt: now };
        this.text.setText(hint.text);
        return;
      }
    }
  }
}
