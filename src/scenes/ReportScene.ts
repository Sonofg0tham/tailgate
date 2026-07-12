import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
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
 * Fixed rows measured up from the page's bottom edge. The summary block and
 * the menu live in reserved slots; the flowing sections above (findings and
 * detections) are capped so they can never run into them, however messy the
 * run was.
 */
const SLOTS = {
  /** Centre of the first menu row. */
  menuTop: 96,
  /** The SUMMARY section title. */
  summaryTitle: 168,
} as const;

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
  /** True from EXPORT REPORT until the snapshot lands; freezes the menu. */
  private exporting = false;
  /** The fading EXPORTED caption, destroyed before any new capture. */
  private exportNote?: Phaser.GameObjects.Text;

  constructor() {
    super('report');
  }

  create(): void {
    new AudioManager().playFoley('document-stamp', 0.62);
    const stats = getRunStats();
    const mission = getMission();
    const level = getActiveLevel();
    const model = generateReport(
      stats as Parameters<typeof generateReport>[0],
      {
        planted: mission.planted,
        photographed: [...mission.photographed],
      },
      { client: level.client, site: level.site, ref: level.ref, venue: level.venue }
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
    this.add.rectangle(centreX, centreY, this.scale.width, this.scale.height, PALETTE_HEX.base);
    this.add
      .rectangle(centreX, centreY, PAGE.width, PAGE.height, PALETTE_HEX.sheet)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.9);

    const left = centreX - PAGE.width / 2 + PAGE.padX;
    const pageBottom = centreY + PAGE.height / 2;
    let y = centreY - PAGE.height / 2 + PAGE.padTop;

    // The detections block has a known height, so the findings list gets
    // whatever room remains above the fixed summary slot.
    const summaryTitleY = pageBottom - SLOTS.summaryTitle;
    const detectionsHeight = 18 + model.clientDetections.length * 14 + 8;
    const findingsMaxY = summaryTitleY - 12 - detectionsHeight;

    y = this.drawHeader(left, y, model);
    y = this.drawFindings(left, y, model.findings, findingsMaxY);
    this.drawClientDetections(left, y, model);
    this.drawSummary(left, summaryTitleY, model);
    this.drawRatingStamp(centreX, centreY, model);
    this.buildMenu(centreX);
  }

  update(): void {
    if (this.exporting) {
      return; // the menu is hidden for the capture; it must not act either
    }
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

  /**
   * Draws the FINDINGS section. Line height tightens if there are many, and
   * the list is capped at maxY: findings that will not fit collapse into one
   * "further findings on file" line, so a kitchen-sink run stays on the page.
   */
  private drawFindings(left: number, top: number, findings: Finding[], maxY: number): number {
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
    const overflowLineHeight = 15;

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      const isSevere = finding.severity === 'CRITICAL' || finding.severity === 'HIGH';
      const label = this.mono(
        left,
        y,
        `${finding.ref}  [${finding.severity}]`,
        11,
        isSevere ? PALETTE.amber : PALETTE.text
      );

      const body = this.add.text(left + 130, y, finding.text, {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
        wordWrap: { width: WRAP_WIDTH },
        lineSpacing: 2,
      });
      const advance = Math.max(lineGap, body.height) + blockGap;

      // Every finding but the last must also leave room for the overflow line.
      const isLast = i === findings.length - 1;
      const fits = y + advance + (isLast ? 0 : overflowLineHeight) <= maxY;
      if (!fits) {
        label.destroy();
        body.destroy();
        const remaining = findings.length - i;
        this.mono(left, y, `Plus ${remaining} further finding(s) on file with the client.`, 11, PALETTE.text);
        y += overflowLineHeight;
        break;
      }
      y += advance;
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

  /**
   * Draws the SUMMARY row and the dry closing remark beneath it, in the fixed
   * slot above the menu (see SLOTS), so the flow above can never reach it.
   */
  private drawSummary(left: number, top: number, model: ReportModel): void {
    let y = top;
    this.mono(left, y, 'SUMMARY', 12, PALETTE.amber);
    y += 18;

    const { summary } = model;
    this.mono(left, y, `TIME ON SITE:  ${summary.timeOnSite}`, 11, PALETTE.text);
    this.mono(left + 240, y, `ALERT LEVEL:  ${summary.alertLevel}`, 11, PALETTE.text);
    this.mono(left + 480, y, `SECONDARIES:  ${summary.secondaries}`, 11, PALETTE.text);
    y += 20;

    this.add.text(left, y, model.ratingRemark, {
      fontFamily: FONTS.mono,
      fontSize: '11px',
      color: PALETTE.text,
      wordWrap: { width: PAGE.width - PAGE.padX * 2 },
    });
  }

  /**
   * The outcome rating as a rubber stamp across the header's empty top-right
   * corner. A fixed slot over fixed content, so however many findings the run
   * produced, the stamp can never sit on top of flowing text again.
   */
  private drawRatingStamp(centreX: number, centreY: number, model: ReportModel): void {
    // Red is reserved for detection states; DETAINED is one, the rest amber.
    const detained = model.rating === 'DETAINED';
    const colour = detained ? PALETTE.alarm : PALETTE.amber;
    const tint = detained ? PALETTE_HEX.alarm : PALETTE_HEX.amber;

    const x = centreX + PAGE.width / 2 - PAGE.padX - 150;
    const y = centreY - PAGE.height / 2 + 44;

    const label = this.add
      .text(0, 0, `RATING: ${model.rating}`, {
        fontFamily: FONTS.mono,
        fontSize: '22px',
        color: colour,
      })
      .setOrigin(0.5);

    const border = this.add
      .rectangle(0, 0, label.width + 28, label.height + 14)
      .setStrokeStyle(2, tint, 0.9)
      .setFillStyle(0, 0);

    // The slight anticlockwise tilt and uneven alpha sell "stamped in a hurry".
    this.add.container(x, y, [border, label]).setRotation(-0.07).setAlpha(0.92);
  }

  /** The end-of-run actions, navigable on pad, keyboard and mouse alike. */
  private buildMenu(centreX: number): void {
    const top = this.scale.height / 2 + PAGE.height / 2 - SLOTS.menuTop;
    this.menu = new MenuController(
      this,
      [
        { kind: 'action', label: '[ RE-RUN ENGAGEMENT ]', onSelect: () => this.newEngagement() },
        { kind: 'action', label: '[ EXPORT REPORT ]', onSelect: () => this.exportReport() },
        { kind: 'action', label: '[ CONTRACTS ]', onSelect: () => this.contracts() },
        { kind: 'action', label: '[ MAIN MENU ]', onSelect: () => this.mainMenu() },
      ],
      { x: centreX, top, rowHeight: 26, width: 340, labelSize: 15 }
    );
  }

  /**
   * Saves the report as a PNG for sharing: hide the menu so the page reads as
   * a clean document, snapshot the canvas, trigger a download, put the menu
   * back. No services involved; the file comes straight off the renderer.
   */
  private exportReport(): void {
    if (this.exporting) {
      return;
    }
    const ref = getActiveLevel().ref.replace(/[^A-Za-z0-9-]+/g, '');
    this.exporting = true;
    // A still-fading note from a previous export must not end up in the file.
    this.exportNote?.destroy();
    this.exportNote = undefined;
    this.menu.setVisible(false);
    this.game.renderer.snapshot((image) => {
      // The snapshot lands a frame or more later. If the scene is gone by
      // then, the capture shows some other screen: do nothing with it.
      if (!this.scene.isActive()) {
        return;
      }
      this.menu.setVisible(true);
      this.exporting = false;
      const src = (image as HTMLImageElement).src;
      if (!src) {
        return;
      }
      const link = document.createElement('a');
      link.href = src;
      link.download = `tailgate-engagement-${ref}.png`;
      link.click();
      this.flashExportNote();
    });
  }

  /** A brief EXPORTED confirmation under the page, fading itself out. */
  private flashExportNote(): void {
    const note = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + PAGE.height / 2 + 11, 'REPORT EXPORTED', {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5);
    this.exportNote = note;
    this.tweens.add({
      targets: note,
      alpha: 0,
      delay: 1400,
      duration: 600,
      onComplete: () => {
        note.destroy();
        if (this.exportNote === note) {
          this.exportNote = undefined;
        }
      },
    });
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
  private mono(
    x: number,
    y: number,
    text: string,
    size: number,
    colour: string
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontFamily: FONTS.mono,
      fontSize: `${size}px`,
      color: colour,
    });
  }
}
