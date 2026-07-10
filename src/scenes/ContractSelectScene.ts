import Phaser from 'phaser';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { getLevels, setActiveLevel, type LevelDef } from '../state/levels';
import { getLevelProgress, hasSeenBriefing, unlockLevel } from '../state/progress';
import { resetMission } from '../state/mission';
import { resetRunStats } from '../state/runStats';
import { MenuController, type MenuItem } from '../ui/MenuController';

/** The gamepad X button (standard mapping), the "view briefing" control. */
const PAD_X = 2;

/** Contract card geometry: three cards stacked, then the BACK row below. */
const CARD = { x: 480, w: 760, h: 86, firstY: 190, gap: 98 } as const;
/** Left edge of the text column inside a card. */
const INNER_LEFT = CARD.x - CARD.w / 2 + 30;
/** Right edge for the rating stamp column. */
const STAMP_RIGHT = CARD.x + CARD.w / 2 - 30;

/**
 * The engagement schedule, styled as the consultancy's contract list per the
 * access-control identity. Each contract is a card: the signed ones open, the
 * rest redacted until the previous job is complete. Selecting a signed
 * contract starts that engagement. Fully navigable on the pad alone, like
 * every meta screen.
 */
export class ContractSelectScene extends Phaser.Scene {
  private menu!: MenuController;
  private status!: Phaser.GameObjects.Text;
  private briefingKey?: Phaser.Input.Keyboard.Key;
  private prevPadX = false;
  private levels: readonly LevelDef[] = [];

  constructor() {
    super('contracts');
  }

  create(): void {
    this.add.rectangle(480, 270, 960, 540, PALETTE_HEX.base);

    this.add
      .text(480, 42, 'SONOFG0THAM SECURITY / CONTRACT SCHEDULE 2026', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 88, 'ENGAGEMENTS', {
        fontFamily: FONTS.display,
        fontSize: '48px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5);

    const levels = getLevels();
    this.levels = levels;
    // The first contract on the schedule is always signed.
    if (levels[0]) {
      unlockLevel(levels[0].id);
    }
    this.briefingKey = this.input.keyboard?.addKey('TAB');
    this.input.keyboard?.addCapture('TAB');
    this.prevPadX = false;

    const items: MenuItem[] = levels.map((level, i) => this.buildCard(level, i));
    items.push({ kind: 'action', label: 'BACK', onSelect: () => this.scene.start('menu') });

    // Menu rows sit on each card's name line; BACK lands below the last card.
    this.menu = new MenuController(this, items, {
      x: CARD.x,
      top: CARD.firstY - 22,
      rowHeight: CARD.gap,
      width: CARD.w - 60,
      labelSize: 20,
    });

    this.status = this.add
      .text(480, 512, 'TAB OR PAD X: VIEW ENGAGEMENT BRIEFING', {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
      })
      .setOrigin(0.5)
      .setAlpha(0.7);

    // A quiet flourish once every contract on the schedule has a completion.
    const playable = levels.filter((level) => level.playable);
    const allDone =
      playable.length > 0 &&
      playable.every((level) => getLevelProgress(level.id).completions > 0);
    if (allDone) {
      this.status
        .setText('ALL CONTRACTS COMPLETE. ENGAGEMENT PROGRAMME CLOSED OUT.')
        .setColor(PALETTE.amber)
        .setAlpha(1);
    }
  }

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);

    // TAB or pad X opens the selected contract's briefing sheet on demand.
    const keyEdge = this.briefingKey ? Phaser.Input.Keyboard.JustDown(this.briefingKey) : false;
    const padX = pad?.buttons?.[PAD_X]?.pressed ?? false;
    const padEdge = padX && !this.prevPadX;
    this.prevPadX = padX;
    if (keyEdge || padEdge) {
      this.openBriefing();
    }
  }

  /** Opens the briefing for the selected row, if it is a live contract. */
  private openBriefing(): void {
    const level = this.levels[this.menu.selectedIndex];
    if (!level) {
      return; // the BACK row
    }
    if (!getLevelProgress(level.id).unlocked || !level.playable) {
      this.status.setText('NO BRIEFING ON FILE FOR THIS CONTRACT.').setAlpha(1);
      return;
    }
    this.scene.start('briefing', { levelId: level.id });
  }

  /** Draws one contract card and returns its menu row. */
  private buildCard(level: LevelDef, index: number): MenuItem {
    const y = CARD.firstY + index * CARD.gap;
    const unlocked = getLevelProgress(level.id).unlocked;

    this.add
      .rectangle(CARD.x, y, CARD.w, CARD.h, 0x151a21)
      .setStrokeStyle(1, PALETTE_HEX.amber, unlocked ? 0.9 : 0.3);

    if (unlocked) {
      this.drawOpenCard(level, y);
    } else {
      this.drawRedactedCard(y);
    }

    const label = unlocked ? level.name : `CONTRACT ${pad2(index + 1)} [REDACTED]`;
    return {
      kind: 'action',
      label,
      onSelect: () => this.selectContract(level, unlocked),
    };
  }

  /** Client, scope and the rating stamp for a countersigned contract. */
  private drawOpenCard(level: LevelDef, cardY: number): void {
    this.mono(INNER_LEFT, cardY + 4, `${level.ref}  ${level.client} / ${level.site}`, PALETTE.text);
    this.mono(INNER_LEFT, cardY + 22, `SCOPE  ${level.scope}`, PALETTE.text);

    const progress = getLevelProgress(level.id);
    if (!level.playable) {
      this.stamp(cardY, 'COUNTERSIGNED', 'SITE SURVEY PENDING', PALETTE.text);
    } else if (progress.bestRating) {
      const best =
        progress.bestTimeSec !== null
          ? `BEST ${formatTime(progress.bestTimeSec)} / RUNS ${progress.completions}`
          : `RUNS ${progress.completions}`;
      this.stamp(cardY, `RATING: ${progress.bestRating}`, best, PALETTE.amber);
    } else {
      this.stamp(cardY, 'NOT YET ASSESSED', '', PALETTE.text);
    }
  }

  /** Redaction bars instead of copy, for a contract not yet countersigned. */
  private drawRedactedCard(cardY: number): void {
    this.add.rectangle(INNER_LEFT + 130, cardY + 10, 260, 9, PALETTE_HEX.text, 0.28).setOrigin(0, 0.5);
    this.add.rectangle(INNER_LEFT + 130, cardY + 28, 380, 9, PALETTE_HEX.text, 0.18).setOrigin(0, 0.5);
    this.stamp(cardY, 'AWAITING', 'COUNTERSIGNATURE', PALETTE.text);
  }

  /** The right-hand stamp column: a headline and a small line under it. */
  private stamp(cardY: number, headline: string, detail: string, colour: string): void {
    this.add
      .text(STAMP_RIGHT, cardY - 8, headline, {
        fontFamily: FONTS.mono,
        fontSize: '14px',
        color: colour,
      })
      .setOrigin(1, 0.5);
    if (detail) {
      this.add
        .text(STAMP_RIGHT, cardY + 10, detail, {
          fontFamily: FONTS.mono,
          fontSize: '10px',
          color: PALETTE.text,
        })
        .setOrigin(1, 0.5);
    }
  }

  private selectContract(level: LevelDef, unlocked: boolean): void {
    if (!unlocked) {
      this.status.setText('CONTRACT NOT YET COUNTERSIGNED. COMPLETE THE PREVIOUS ENGAGEMENT.').setAlpha(1);
      return;
    }
    if (!level.playable) {
      this.status.setText('SITE SURVEY PENDING. THIS CONTRACT OPENS IN A FUTURE UPDATE.').setAlpha(1);
      return;
    }
    // A contract's first run goes via its briefing sheet; afterwards the
    // schedule starts the site directly and the sheet stays on TAB / pad X.
    if (!hasSeenBriefing(level.id)) {
      this.scene.start('briefing', { levelId: level.id });
      return;
    }
    setActiveLevel(level.id);
    resetMission(level.id);
    resetRunStats();
    this.scene.start('building');
  }

  private mono(x: number, y: number, text: string, colour: string): void {
    this.add
      .text(x, y, text, { fontFamily: FONTS.mono, fontSize: '11px', color: colour })
      .setOrigin(0, 0.5);
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Whole seconds as "mm:ss" for the personal best line. */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}
