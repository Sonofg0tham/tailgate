import Phaser from 'phaser';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { initLevelRegistry } from '../state/levels';
import { MenuController } from '../ui/MenuController';

/** The kiosk card geometry, a lighter sheet on the near-black like the report. */
const CARD = { x: 480, y: 268, w: 580, h: 260 } as const;

/**
 * The main menu, styled as a corporate visitor sign-in kiosk per the identity
 * spec. The player "signs in" to start the engagement. Controls for both the
 * gamepad and the keyboard are printed on screen, and everything here is
 * navigable on the pad alone.
 */
export class MenuScene extends Phaser.Scene {
  private menu!: MenuController;

  constructor() {
    super('menu');
  }

  preload(): void {
    // The contract schedule. Loaded here so the registry is ready before any
    // scene needs it; the loader skips it on later visits.
    this.load.json('levels', 'data/levels.json');
  }

  create(): void {
    initLevelRegistry(this.cache.json.get('levels'));

    this.add.rectangle(480, 270, 960, 540, PALETTE_HEX.base);

    // Kicker, wordmark and strapline.
    this.centreText(480, 42, 'VISITOR SIGN-IN KIOSK', FONTS.mono, 12, PALETTE.text);
    this.add
      .text(480, 82, 'TAILGATE', { fontFamily: FONTS.display, fontSize: '58px', color: PALETTE.amber })
      .setOrigin(0.5);
    this.centreText(480, 120, 'PHYSICAL SECURITY ASSESSMENT PROGRAMME', FONTS.mono, 12, PALETTE.text);

    // The sign-in card.
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
    this.menu = new MenuController(
      this,
      [
        { kind: 'action', label: 'SELECT ENGAGEMENT', onSelect: () => this.openContracts() },
        { kind: 'action', label: 'SETTINGS', onSelect: () => this.openSettings() },
      ],
      { x: CARD.x, top: CARD.y + 58, rowHeight: 34, width: 300, labelSize: 20 }
    );

    this.drawControls();
  }

  update(): void {
    const pad = this.activePad();
    this.menu.update(pad);
  }

  /** Opens the contract schedule; picking a contract starts that engagement. */
  private openContracts(): void {
    this.scene.start('contracts');
  }

  /** Opens settings over the paused kiosk; it resumes us when it closes. */
  private openSettings(): void {
    this.scene.launch('settings', { returnScene: 'menu' });
    this.scene.pause();
  }

  /** The two control legends, gamepad on the left, keyboard on the right. */
  private drawControls(): void {
    const top = 428;
    const gamepad: [string, string][] = [
      ['Left stick', 'Move & set pace'],
      ['A', 'Interact'],
      ['R2 / R-stick', 'Throw & aim'],
      ['Start', 'Pause'],
    ];
    const keyboard: [string, string][] = [
      ['WASD / Arrows', 'Move'],
      ['Shift / C', 'Creep / Run'],
      ['E', 'Interact'],
      ['Click / Esc', 'Throw / Pause'],
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
  ): void {
    this.add
      .text(x, y, text, { fontFamily: font, fontSize: `${size}px`, color: colour })
      .setOrigin(0.5);
  }

  private activePad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const plugin = this.input.gamepad;
    return plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
  }
}
