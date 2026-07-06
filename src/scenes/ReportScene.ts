import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';
import { generateReport, type Finding, type ReportModel } from '../report/generateReport';
import { getActiveLevel, nextLevelAfter } from '../state/levels';
import { getMission, resetMission } from '../state/mission';
import { recordCompletion, unlockLevel } from '../state/progress';
import { getRunStats, resetRunStats } from '../state/runStats';
import { MenuController } from '../ui/MenuController';

/** Page geometry. The report sits on the near-black like a printed sheet. */
const PAGE = {
  width: 880,
  height: 500,
  padX: 28,
  padTop: 20,
} as const;

/** Body text width for word wrapping inside the page margins. */
const WRAP_WIDTH = PAGE.width - PAGE.padX * 2 - 70;

/**
 * The Engagement Report end screen. Renders the report built by
 * generateReport() as a one-page corporate access-control artefact: header,
 * findings, client detections, a summary block and the big outcome rating.
 *
 * Everything is read straight from the run and mission singletons at create
 * time, so the scene takes no init data. The reset button starts a completely
 * fresh engagement and drops the player back into the building.
 */
export class ReportScene extends Phaser.Scene {
  private menu!: MenuController;

  constructor() {
    super('report');
  }

  create(): void {
    const stats = getRunStats();
    const mission = getMission();
    const level = getActiveLevel();
    const model = generateReport(
      stats as Parameters<typeof generateReport>[0],
      {
        planted: mission.planted,
        photographed: [...mission.photographed],
      },
      { client: level.client, site: level.site, ref: level.ref }
    );

    // Reaching the report is a completion at any rating: log the personal
    // best and countersign the next contract on the schedule.
    recordCompletion(level.id, model.rating, Math.floor((stats.exfilAtMs ?? 0) / 1000));
    const next = nextLevelAfter(level.id);
    if (next) {
      unlockLevel(next.id);
    }

    const centreX = this.scale.width / 2;
    const centreY = this.scale.height / 2;

    // Base backdrop and the lighter "sheet of paper" panel with a thin amber border.
    this.add.rectangle(centreX, centreY, this.scale.width, this.scale.height, 0x0e1116);
    this.add
      .rectangle(centreX, centreY, PAGE.width, PAGE.height, 0x151a21)
      .setStrokeStyle(1, 0xffb000, 0.9);

    const left = centreX - PAGE.width / 2 + PAGE.padX;
    let y = centreY - PAGE.height / 2 + PAGE.padTop;

    y = this.drawHeader(left, y, model);
    y = this.drawFindings(left, y, model.findings);
    y = this.drawClientDetections(left, y, model);
    this.drawSummary(left, y, model);
    this.drawRating(centreX, model);
    this.buildMenu(centreX);
  }

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);
  }

  /** Draws the confidential caption, big title and the header fields. */
  private drawHeader(left: number, top: number, model: ReportModel): number {
    let y = top;
    this.mono(left, y, 'PHYSICAL SECURITY ASSESSMENT / PRIVATE AND CONFIDENTIAL', 10, PALETTE.text);
    y += 16;

    this.add.text(left, y, 'ENGAGEMENT REPORT', {
      fontFamily: FONTS.display,
      fontSize: '34px',
      color: PALETTE.amber,
    });
    y += 40;

    const { header } = model;
    this.mono(left, y, `CLIENT:     ${header.client}`, 11, PALETTE.text);
    this.mono(left + 440, y, `REF:  ${header.ref}`, 11, PALETTE.text);
    y += 15;
    this.mono(left, y, `SITE:       ${header.site}`, 11, PALETTE.text);
    this.mono(left + 440, y, `DATE: ${header.date}`, 11, PALETTE.text);
    y += 15;
    this.mono(left, y, `CONSULTANT: ${header.consultant}`, 11, PALETTE.text);
    y += 22;

    return y;
  }

  /** Draws the FINDINGS section. Line height tightens if there are many. */
  private drawFindings(left: number, top: number, findings: Finding[]): number {
    let y = top;
    this.mono(left, y, 'FINDINGS', 12, PALETTE.amber);
    y += 18;

    if (findings.length === 0) {
      this.mono(left, y, 'No exploitable findings recorded this engagement.', 11, PALETTE.text);
      return y + 20;
    }

    // Reserve vertical room so findings never collide with the sections below.
    const lineGap = findings.length > 5 ? 13 : 15;
    const blockGap = findings.length > 5 ? 4 : 7;

    for (const finding of findings) {
      const isSevere = finding.severity === 'CRITICAL' || finding.severity === 'HIGH';
      const label = `${finding.ref}  [${finding.severity}]`;
      this.mono(left, y, label, 11, isSevere ? PALETTE.amber : PALETTE.text);

      const body = this.add.text(left + 130, y, finding.text, {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
        wordWrap: { width: WRAP_WIDTH },
        lineSpacing: 2,
      });
      const bodyHeight = body.height;
      y += Math.max(lineGap, bodyHeight) + blockGap;
    }

    return y + 4;
  }

  /** Draws the CLIENT DETECTIONS section. Red only when something was noticed. */
  private drawClientDetections(left: number, top: number, model: ReportModel): number {
    let y = top;
    this.mono(left, y, 'CLIENT DETECTIONS', 12, PALETTE.amber);
    y += 18;

    // Red only if the client actually detected something. The "None" line is grey.
    const detected = !model.clientDetections[0]?.startsWith('None');
    const colour = detected ? PALETTE.alarm : PALETTE.text;
    for (const line of model.clientDetections) {
      this.mono(left, y, line, 11, colour);
      y += 14;
    }

    return y + 8;
  }

  /** Draws the one-line SUMMARY block. */
  private drawSummary(left: number, top: number, model: ReportModel): void {
    let y = top;
    this.mono(left, y, 'SUMMARY', 12, PALETTE.amber);
    y += 18;

    const { summary } = model;
    this.mono(left, y, `TIME ON SITE:  ${summary.timeOnSite}`, 11, PALETTE.text);
    this.mono(left + 240, y, `ALERT LEVEL:  ${summary.alertLevel}`, 11, PALETTE.text);
    this.mono(left + 480, y, `SECONDARIES:  ${summary.secondaries}`, 11, PALETTE.text);
  }

  /** Draws the big outcome rating and its dry remark, bottom of the page. */
  private drawRating(centreX: number, model: ReportModel): void {
    const y = this.scale.height / 2 + PAGE.height / 2 - 132;
    const detained = model.rating === 'DETAINED';
    const colour = detained ? PALETTE.alarm : PALETTE.amber;

    this.add
      .text(centreX, y, `RATING: ${model.rating}`, {
        fontFamily: FONTS.mono,
        fontSize: '26px',
        color: colour,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(centreX, y + 34, model.ratingRemark, {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
        align: 'center',
        wordWrap: { width: PAGE.width - 120 },
      })
      .setOrigin(0.5, 0);
  }

  /** The end-of-run actions, navigable on pad, keyboard and mouse alike. */
  private buildMenu(centreX: number): void {
    const top = this.scale.height / 2 + PAGE.height / 2 - 76;
    this.menu = new MenuController(
      this,
      [
        { kind: 'action', label: '[ RE-RUN ENGAGEMENT ]', onSelect: () => this.newEngagement() },
        { kind: 'action', label: '[ CONTRACTS ]', onSelect: () => this.contracts() },
        { kind: 'action', label: '[ MAIN MENU ]', onSelect: () => this.mainMenu() },
      ],
      { x: centreX, top, rowHeight: 30, width: 340, labelSize: 15 }
    );
  }

  /** Re-runs the same contract from the van, chasing a better rating. */
  private newEngagement(): void {
    resetRunStats();
    resetMission(getActiveLevel().id);
    this.scene.start('building');
  }

  /** Clears the run and returns to the contract schedule. */
  private contracts(): void {
    resetRunStats();
    resetMission();
    this.scene.start('contracts');
  }

  /** Clears the run and returns to the sign-in kiosk. */
  private mainMenu(): void {
    resetRunStats();
    resetMission();
    this.scene.start('menu');
  }

  /** Small helper for a left-aligned mono line, keeping create() readable. */
  private mono(x: number, y: number, text: string, size: number, colour: string): void {
    this.add.text(x, y, text, {
      fontFamily: FONTS.mono,
      fontSize: `${size}px`,
      color: colour,
    });
  }
}
