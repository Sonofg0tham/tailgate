import Phaser from 'phaser';
import { ENGAGEMENT } from '../config/engagement';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { getActiveLevel, getLevel, setActiveLevel, type LevelDef } from '../state/levels';
import { resetMission } from '../state/mission';
import { markBriefingSeen } from '../state/progress';
import { resetRunStats } from '../state/runStats';
import { MenuController } from '../ui/MenuController';

/** Sheet geometry, matching the Engagement Report's printed-page framing. */
const PAGE = { width: 880, height: 500, padX: 28, padTop: 20 } as const;

/**
 * The pre-mission briefing, styled as the letter of authorisation: the sheet
 * of paper a real consultant carries on site. Scope, rules of engagement and
 * an INTEL section that teaches the venue's signature way in, all authored
 * per level in levels.json. Shown automatically before a contract's first
 * run, and any time after from the contract schedule.
 *
 * PROCEED starts the engagement (and marks the briefing read); BACK returns
 * to the schedule. Fully pad-navigable like every meta screen.
 */
export class BriefingScene extends Phaser.Scene {
  private menu!: MenuController;
  private level!: LevelDef;

  constructor() {
    super('briefing');
  }

  init(data: { levelId?: string }): void {
    this.level = (data.levelId ? getLevel(data.levelId) : undefined) ?? getActiveLevel();
  }

  create(): void {
    const centreX = this.scale.width / 2;
    const centreY = this.scale.height / 2;

    this.add.rectangle(centreX, centreY, this.scale.width, this.scale.height, PALETTE_HEX.base);
    this.add
      .rectangle(centreX, centreY, PAGE.width, PAGE.height, PALETTE_HEX.sheet)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.9);

    const left = centreX - PAGE.width / 2 + PAGE.padX;
    let y = centreY - PAGE.height / 2 + PAGE.padTop;

    this.mono(left, y, 'PHYSICAL SECURITY ASSESSMENT / LETTER OF AUTHORISATION', 10, PALETTE.text);
    y += 16;
    this.add.text(left, y, 'ENGAGEMENT BRIEFING', {
      fontFamily: FONTS.display,
      fontSize: '34px',
      color: PALETTE.amber,
    });
    y += 40;

    this.mono(left, y, `CLIENT:     ${this.level.client}`, 11, PALETTE.text);
    this.mono(left + 440, y, `REF:  ${this.level.ref}`, 11, PALETTE.text);
    y += 15;
    this.mono(left, y, `SITE:       ${this.level.site}`, 11, PALETTE.text);
    this.mono(left + 440, y, `DATE: ${ENGAGEMENT.date}`, 11, PALETTE.text);
    y += 24;

    y = this.section(left, y, 'SCOPE', [this.level.scope]);
    y = this.section(left, y, 'RULES OF ENGAGEMENT', this.level.briefing?.roe ?? []);
    this.section(left, y, 'INTEL', this.level.briefing?.intel ?? []);

    this.drawCountersign(centreX, centreY);
    this.buildMenu(centreX, centreY);
  }

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);
  }

  /** One titled block of wrapped lines; returns the y below the block. */
  private section(left: number, top: number, title: string, lines: string[]): number {
    let y = top;
    this.mono(left, y, title, 12, PALETTE.amber);
    y += 17;
    for (const line of lines) {
      const body = this.add.text(left, y, `- ${line}`, {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
        wordWrap: { width: PAGE.width - PAGE.padX * 2 },
        lineSpacing: 2,
      });
      y += Math.max(14, body.height) + 2;
    }
    return y + 10;
  }

  /** The countersignature strip along the sheet's lower edge. */
  private drawCountersign(centreX: number, centreY: number): void {
    const y = centreY + PAGE.height / 2 - 88;
    const left = centreX - PAGE.width / 2 + PAGE.padX;
    const right = centreX + PAGE.width / 2 - PAGE.padX;

    this.add.rectangle(centreX, y - 8, PAGE.width - PAGE.padX * 2, 1, PALETTE_HEX.amber, 0.4);
    this.mono(left, y, `COUNTERSIGNED: ${this.level.client}`, 10, PALETTE.text);
    this.add
      .text(right, y, ENGAGEMENT.consultant, {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: PALETTE.text,
      })
      .setOrigin(1, 0);
  }

  private buildMenu(centreX: number, centreY: number): void {
    const top = centreY + PAGE.height / 2 - 58;
    this.menu = new MenuController(
      this,
      [
        { kind: 'action', label: '[ PROCEED TO SITE ]', onSelect: () => this.proceed() },
        { kind: 'action', label: '[ BACK TO SCHEDULE ]', onSelect: () => this.back() },
      ],
      { x: centreX, top, rowHeight: 26, width: 340, labelSize: 15 },
      { onBack: () => this.back() }
    );
  }

  /** Signs the sheet and goes to site: a fresh run of this contract. */
  private proceed(): void {
    markBriefingSeen(this.level.id);
    setActiveLevel(this.level.id);
    resetMission(this.level.id);
    resetRunStats();
    this.scene.start('building');
  }

  private back(): void {
    this.scene.start('contracts');
  }

  /** Small helper for a left-aligned mono line. */
  private mono(x: number, y: number, text: string, size: number, colour: string): void {
    this.add.text(x, y, text, {
      fontFamily: FONTS.mono,
      fontSize: `${size}px`,
      color: colour,
    });
  }
}
