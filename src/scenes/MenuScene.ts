import Phaser from 'phaser';
import { KIOSK } from '../config/kiosk';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { initLevelRegistry } from '../state/levels';
import { getSettings } from '../state/settings';
import { MenuController } from '../ui/MenuController';
import { fadeIn, fadeToScene } from '../ui/transitions';

/** The kiosk card geometry, a lighter sheet on the near-black like the report. */
const CARD = { x: 480, y: 268, w: 580, h: 260 } as const;

/** The action rows inside the card. The block caret tracks these. */
const ROWS = { x: CARD.x, top: CARD.y + 58, rowHeight: 34, width: 300, labelSize: 20 } as const;

/** The header line that types itself on when the kiosk first powers up. */
const HEADER = 'VISITOR SIGN-IN KIOSK';

/**
 * The kiosk boots once per session. Scenes are rebuilt every time they are
 * revisited, so this flag lives at module scope: the same run-once shape the
 * first-run hints use, minus the persistence. Coming back from the contract
 * schedule must not retype the header, but a page reload should feel like
 * powering the kiosk on again.
 */
let kioskBooted = false;

/**
 * The main menu, styled as a corporate visitor sign-in kiosk per the identity
 * spec. The player "signs in" to start the engagement. Controls for both the
 * gamepad and the keyboard are printed on screen, and everything here is
 * navigable on the pad alone.
 *
 * The kiosk is dressed as powered hardware rather than a static page: a
 * blinking block caret on the selected row, a slow sheen across the wordmark,
 * a breathing glow on the card and a one-off type-on for the header. None of
 * it touches the layout, and none of it gates input.
 */
export class MenuScene extends Phaser.Scene {
  private menu!: MenuController;
  /** The blinking block cursor and the row it is currently parked on. */
  private caret!: Phaser.GameObjects.Rectangle;
  private caretRow = -1;
  /** Pre-measured caret x for each row, so update() never measures text. */
  private caretX: number[] = [];
  /** The looping dressing, held so the SCREEN EFFECTS setting can stop it. */
  private loopTweens: Phaser.Tweens.Tween[] = [];
  private sheen!: Phaser.GameObjects.Text;
  private sheenBand!: Phaser.GameObjects.Graphics;
  private sheenTravel = 0;
  private sheenBaseX = 0;
  private glow!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('menu');
  }

  preload(): void {
    // The contract schedule. Loaded here so the registry is ready before any
    // scene needs it; the loader skips it on later visits.
    this.load.json('levels', 'data/levels.json');
  }

  create(): void {
    // Scene objects are reused across restarts, so drop any dead tween handles
    // from the last visit before the loop gating below reads them.
    this.loopTweens = [];
    initLevelRegistry(this.cache.json.get('levels'));

    this.add.rectangle(480, 270, 960, 540, PALETTE_HEX.base);

    // Kicker, wordmark and strapline.
    const header = this.centreText(480, 42, HEADER, FONTS.mono, 12, PALETTE.text);
    const title = this.add
      .text(480, 82, 'TAILGATE', { fontFamily: FONTS.display, fontSize: '58px', color: PALETTE.amber })
      .setOrigin(0.5);
    this.centreText(480, 120, 'PHYSICAL SECURITY ASSESSMENT PROGRAMME', FONTS.mono, 12, PALETTE.text);
    this.typeHeader(header);
    this.buildTitleSheen(title);

    // The sign-in card, with a soft ring outside it that breathes.
    this.buildCardGlow();
    this.add
      .rectangle(CARD.x, CARD.y, CARD.w, CARD.h, 0x151a21)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.9);

    const fieldX = CARD.x - CARD.w / 2 + 34;
    let y = CARD.y - CARD.h / 2 + 26;
    const fields: [string, string][] = [
      ['VISITOR', 'C. MCCART'],
      ['COMPANY', 'SONOFG0THAM SECURITY'],
      ['HOST', 'MERIDIAN GROUP FACILITIES'],
      ['PURPOSE', 'AUTHORISED PENETRATION TEST'],
      ['BADGE', 'NONE ISSUED'],
    ];
    for (const [key, value] of fields) {
      this.add.text(fieldX, y, `${key.padEnd(9)}${value}`, {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: PALETTE.text,
      });
      y += 19;
    }

    // Divider between the sign-in details and the actions.
    this.add
      .rectangle(CARD.x, CARD.y + 26, CARD.w - 56, 1, PALETTE_HEX.amber, 0.4)
      .setOrigin(0.5);

    // The actions, driven by the shared menu controller.
    const actions = [
      { label: 'SELECT ENGAGEMENT', run: () => this.openContracts() },
      { label: 'SETTINGS', run: () => this.openSettings() },
    ];
    this.menu = new MenuController(
      this,
      actions.map(({ label, run }) => ({ kind: 'action' as const, label, onSelect: run })),
      ROWS
    );
    this.buildCaret(actions.map((action) => action.label));

    this.drawControls();

    // The looping dressing rides the SCREEN EFFECTS setting, and re-checks it
    // whenever the settings sheet resumes us, so switching it off takes effect
    // the moment the player is back on the kiosk.
    this.applyLoopSetting();
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.applyLoopSetting());

    // Belt and braces: the looping dressing tweens and the off-list mask shape
    // go with the scene rather than outliving it.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tweens.killAll());
    fadeIn(this);
  }

  update(): void {
    const pad = this.activePad();
    this.menu.update(pad);
    this.syncCaret();
  }

  /** Opens the contract schedule; picking a contract starts that engagement. */
  private openContracts(): void {
    fadeToScene(this, 'contracts');
  }

  /** Opens settings over the paused kiosk; it resumes us when it closes. */
  private openSettings(): void {
    this.scene.launch('settings', { returnScene: 'menu' });
    this.scene.pause();
  }

  /**
   * Types the header on, once per session, like a terminal waking up. Any key,
   * pad button or click finishes it on the spot, and the menu is live
   * throughout: this is dressing, never a gate.
   */
  private typeHeader(header: Phaser.GameObjects.Text): void {
    if (kioskBooted) {
      return;
    }
    kioskBooted = true;

    // Pin the line to where its finished self starts, so it types left to
    // right and the finished layout is pixel for pixel what it was before.
    header.setOrigin(0, 0.5).setX(480 - header.width / 2);

    let shown = 0;
    header.setText('');
    const timer = this.time.addEvent({
      delay: Math.max(16, Math.round(KIOSK.boot.totalMs / HEADER.length)),
      repeat: HEADER.length - 1,
      callback: () => {
        shown += 1;
        header.setText(HEADER.slice(0, shown));
      },
    });

    const finish = (): void => {
      timer.remove();
      header.setText(HEADER);
    };
    this.input.keyboard?.once('keydown', finish);
    this.input.gamepad?.once('down', finish);
    this.input.once('pointerdown', finish);
  }

  /**
   * A slow amber highlight passing across the wordmark. A brighter copy of the
   * title is masked to a moving band, so only the letters lift: the background
   * never changes, and one pass every nine seconds is nowhere near a flash.
   */
  private buildTitleSheen(title: Phaser.GameObjects.Text): void {
    this.sheen = this.add
      .text(title.x, title.y, title.text, {
        fontFamily: FONTS.display,
        fontSize: '58px',
        color: KIOSK.sheen.colour,
      })
      .setOrigin(0.5)
      .setAlpha(KIOSK.sheen.alpha);

    // The mask shape stays off the display list: it only carves the highlight.
    this.sheenBand = this.make.graphics({}, false);
    this.sheenBand.fillStyle(0xffffff, 1);
    this.sheenBand.fillRect(
      -KIOSK.sheen.bandPx / 2,
      title.y - title.height,
      KIOSK.sheen.bandPx,
      title.height * 2
    );
    this.sheen.setMask(this.sheenBand.createGeometryMask());

    // The sweep tween itself starts in applyLoopSetting, so the sheen obeys
    // the SCREEN EFFECTS setting; here the band just parks off the wordmark.
    this.sheenTravel = title.width / 2 + KIOSK.sheen.bandPx;
    this.sheenBaseX = title.x;
    this.sheenBand.setX(title.x - this.sheenTravel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sheenBand.destroy());
  }

  /** A ring just outside the sign-in card, breathing so the kiosk reads as live. */
  private buildCardGlow(): void {
    this.glow = this.add
      .rectangle(
        CARD.x,
        CARD.y,
        CARD.w + KIOSK.cardGlow.insetPx * 2,
        CARD.h + KIOSK.cardGlow.insetPx * 2
      )
      .setStrokeStyle(2, PALETTE_HEX.amber, KIOSK.cardGlow.minAlpha);
  }

  /**
   * The block cursor that sits at the end of the selected row, blinking like a
   * terminal. Row label widths are measured once here, so following the
   * selection later is a single setPosition and no allocation.
   */
  private buildCaret(labels: string[]): void {
    const probe = this.add
      .text(0, 0, '', { fontFamily: FONTS.mono, fontSize: `${ROWS.labelSize}px` })
      .setVisible(false);
    const leftX = ROWS.x - ROWS.width / 2;
    this.caretX = labels.map((label) => {
      probe.setText(label);
      return leftX + probe.width + KIOSK.caret.gapPx;
    });
    probe.destroy();

    this.caret = this.add
      .rectangle(
        this.caretX[0],
        ROWS.top,
        KIOSK.caret.widthPx,
        KIOSK.caret.heightPx,
        PALETTE_HEX.amber
      )
      .setOrigin(0, 0.5);
    this.caretRow = 0;
  }

  /**
   * Starts or stops the looping dressing to match the SCREEN EFFECTS setting:
   * the wordmark sheen, the card glow breathe and the caret blink. With the
   * setting off the kiosk holds a rest state, a solid caret and a faint steady
   * ring, so nothing on the screen moves on its own. One-shot reveals like the
   * header type-on are not loops and stay either way.
   */
  private applyLoopSetting(): void {
    const on = getSettings().screenEffects;
    if (on && this.loopTweens.length === 0) {
      this.sheen.setVisible(true);
      this.sheenBand.setX(this.sheenBaseX - this.sheenTravel);
      this.loopTweens = [
        this.tweens.add({
          targets: this.sheenBand,
          x: this.sheenBaseX + this.sheenTravel,
          duration: KIOSK.sheen.sweepMs,
          delay: KIOSK.sheen.firstDelayMs,
          repeat: -1,
          repeatDelay: Math.max(0, KIOSK.sheen.periodMs - KIOSK.sheen.sweepMs),
        }),
        this.tweens.add({
          targets: this.glow,
          strokeAlpha: KIOSK.cardGlow.maxAlpha,
          duration: KIOSK.cardGlow.breathMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
        this.tweens.add({
          targets: this.caret,
          alpha: KIOSK.caret.minAlpha,
          duration: KIOSK.caret.fadeMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      ];
      return;
    }
    if (!on) {
      for (const tween of this.loopTweens) {
        tween.remove();
      }
      this.loopTweens = [];
      this.sheen.setVisible(false);
      this.caret.setAlpha(1);
      this.glow.setStrokeStyle(2, PALETTE_HEX.amber, KIOSK.cardGlow.minAlpha);
    }
  }

  /** Parks the block cursor on whichever row the menu has selected. */
  private syncCaret(): void {
    const row = this.menu.selectedIndex;
    if (row === this.caretRow) {
      return;
    }
    this.caretRow = row;
    this.caret.setPosition(this.caretX[row] ?? this.caretX[0], ROWS.top + row * ROWS.rowHeight);
  }

  /**
   * The two control legends, gamepad on the left, keyboard on the right.
   *
   * Every row is one input and one action. The Phase 20 playtest lost the run
   * control entirely: the old legend paired "Shift / C" against "Creep / Run"
   * and left the reader to work out which key was which, so running was never
   * found. Paired rows read as a puzzle, and a puzzle in a legend is a bug.
   */
  private drawControls(): void {
    const top = 410;
    const gamepad: [string, string][] = [
      ['Left stick', 'Move'],
      ['Push further', 'Creep to run'],
      ['A', 'Interact'],
      ['R2 / R-stick', 'Throw & aim'],
      ['Start', 'Pause'],
    ];
    const keyboard: [string, string][] = [
      ['WASD / Arrows', 'Move'],
      ['Hold Shift', 'Creep, silent'],
      ['Hold C', 'Run, loud'],
      ['E', 'Interact'],
      ['Click', 'Throw bolt'],
      ['Esc', 'Pause'],
    ];
    this.drawLegend(250, top, 'GAMEPAD', gamepad);
    this.drawLegend(560, top, 'KEYBOARD', keyboard);
  }

  private drawLegend(x: number, top: number, title: string, rows: [string, string][]): void {
    this.add.text(x, top, title, { fontFamily: FONTS.mono, fontSize: '12px', color: PALETTE.amber });
    let y = top + 18;
    for (const [key, value] of rows) {
      this.add.text(x, y, `${key.padEnd(14)}${value}`, {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
      });
      y += 15;
    }
  }

  private centreText(
    x: number,
    y: number,
    text: string,
    font: string,
    size: number,
    colour: string
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: font, fontSize: `${size}px`, color: colour })
      .setOrigin(0.5);
  }

  private activePad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const plugin = this.input.gamepad;
    return plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
  }
}
