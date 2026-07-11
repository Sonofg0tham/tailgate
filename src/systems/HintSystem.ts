import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';
import { READABILITY } from '../config/readability';
import { getSettings } from '../state/settings';
import type { LevelHint } from '../state/levels';
import { hasSeenHint, markHintSeen } from '../state/progress';

/**
 * First-run contextual hints: consultant's notes that surface once, ever, the
 * first time the player lingers near a point of interest. The definitions live
 * in each level's entry in levels.json (position, radius, one line of copy);
 * the once-per-profile flags persist with campaign progress.
 *
 * Two rules keep them kind rather than naggy. A hint is only marked seen after
 * it has actually been on screen for a readable moment, so sprinting past does
 * not burn it unread. And it fades in and out rather than popping, matching the
 * game's small-and-slow motion. One quiet grey line above the mission prompt.
 */
export class HintSystem {
  private readonly levelId: string;
  private readonly hints: readonly LevelHint[];
  private readonly text: Phaser.GameObjects.Text;
  private active: { hint: LevelHint; shownAt: number; marked: boolean } | null = null;

  constructor(scene: Phaser.Scene, levelId: string, hints: readonly LevelHint[]) {
    this.levelId = levelId;
    this.hints = hints;
    this.text = scene.add
      .text(scene.scale.width / 2, scene.scale.height - READABILITY.hints.riseFromBottomPx, '', {
        fontFamily: FONTS.mono,
        fontSize: `${READABILITY.hints.textSizePx}px`,
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0);
  }

  /** The text object, so secondary feed cameras can ignore it. */
  get gameObject(): Phaser.GameObjects.Text {
    return this.text;
  }

  update(now: number, playerX: number, playerY: number): void {
    this.text.setScale(getSettings().hudScale);

    if (this.active) {
      this.advanceActive(now, playerX, playerY);
      return;
    }

    const { markSeenAfterMs } = READABILITY.hints;
    for (const hint of this.hints) {
      if (hasSeenHint(this.levelId, hint.id)) {
        continue;
      }
      if (this.inRange(hint, playerX, playerY)) {
        this.active = { hint, shownAt: now, marked: false };
        this.text.setText(hint.text).setAlpha(0);
        // A zero-dwell hint (should not happen) would never mark itself, so
        // guard against a 0 config by marking immediately in that case.
        if (markSeenAfterMs <= 0) {
          markHintSeen(this.levelId, hint.id);
          this.active.marked = true;
        }
        return;
      }
    }
  }

  /** Runs the fade envelope for the showing hint and retires it when done. */
  private advanceActive(now: number, playerX: number, playerY: number): void {
    if (!this.active) {
      return;
    }
    const { hint, shownAt } = this.active;
    const { showForMs, fadeInMs, fadeOutMs, maxAlpha, markSeenAfterMs } = READABILITY.hints;
    const elapsed = now - shownAt;
    const stillNear = this.inRange(hint, playerX, playerY);

    // Only commit the hint to "seen" once it has genuinely been read at.
    if (!this.active.marked && stillNear && elapsed >= markSeenAfterMs) {
      markHintSeen(this.levelId, hint.id);
      this.active.marked = true;
    }

    // Walking away before it is marked drops it silently, so it can teach on a
    // calmer approach later. After it is marked, walking away fades it out.
    if (!stillNear && !this.active.marked) {
      this.clear();
      return;
    }
    if (elapsed >= showForMs) {
      this.clear();
      return;
    }

    // Fade in, hold, fade out across the display window.
    let alpha = maxAlpha;
    if (elapsed < fadeInMs) {
      alpha = (elapsed / fadeInMs) * maxAlpha;
    } else if (elapsed > showForMs - fadeOutMs) {
      alpha = ((showForMs - elapsed) / fadeOutMs) * maxAlpha;
    }
    this.text.setAlpha(Phaser.Math.Clamp(alpha, 0, maxAlpha));
  }

  private clear(): void {
    this.active = null;
    this.text.setText('').setAlpha(0);
  }

  private inRange(hint: LevelHint, playerX: number, playerY: number): boolean {
    return Phaser.Math.Distance.Between(playerX, playerY, hint.x, hint.y) <= hint.radiusPx;
  }
}
