import Phaser from 'phaser';
import { FONTS, PALETTE } from '../config/palette';

/**
 * A menu row that performs an action when chosen (Start, Resume, Back...).
 */
export interface MenuAction {
  kind: 'action';
  label: string;
  onSelect: () => void;
}

/**
 * A menu row that holds an adjustable value (a slider or a toggle). Left/right
 * change it; the current value is rendered on the right of the row.
 */
export interface MenuValue {
  kind: 'value';
  label: string;
  /** Current value formatted for display, e.g. "80%", "ON", "1.2x". */
  getDisplay: () => string;
  /** Nudge the value one step down (-1) or up (+1). */
  adjust: (dir: -1 | 1) => void;
  /**
   * Whether holding left/right keeps adjusting. True for sliders, false for
   * toggles (holding a two-state toggle should not flicker it). Default true.
   */
  repeatable?: boolean;
}

export type MenuItem = MenuAction | MenuValue;

/** Where and how big the menu is drawn. */
export interface MenuStyle {
  /** Centre x of the menu column. */
  x: number;
  /** Y of the first row's centre. */
  top: number;
  rowHeight: number;
  /** Row width, used for the value right-align and the pointer hit area. */
  width: number;
  labelSize?: number;
  valueSize?: number;
}

/** Delay before a held direction starts repeating, and the repeat interval, ms. */
const REPEAT_INITIAL_MS = 340;
const REPEAT_INTERVAL_MS = 120;
/** Left-stick magnitude past which it counts as a direction press. */
const STICK_THRESHOLD = 0.5;

/**
 * One reusable menu for every meta screen: the kiosk, the pause badge and the
 * settings sheet. It handles gamepad (d-pad, left stick and A/B), keyboard
 * (arrows or WASD, Enter/Space, Escape) and the mouse together, so the whole
 * game is playable end to end on the pad without ever touching the keyboard,
 * which is the Phase 6 accessibility requirement.
 *
 * The owning scene builds the items and the title art, then calls update(pad)
 * every frame. The controller owns only the row text and the selection caret.
 */
export class MenuController {
  private readonly scene: Phaser.Scene;
  private readonly items: MenuItem[];
  private readonly style: Required<MenuStyle>;
  private readonly onBack?: () => void;

  private index = 0;
  private caret!: Phaser.GameObjects.Text;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly values: (Phaser.GameObjects.Text | null)[] = [];

  private readonly keys: Record<string, Phaser.Input.Keyboard.Key | undefined> = {};
  private prevPad: Record<'up' | 'down' | 'left' | 'right' | 'a' | 'b', boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
  };
  private repeatState: Record<'v' | 'h', { dir: -1 | 0 | 1; nextAt: number }> = {
    v: { dir: 0, nextAt: 0 },
    h: { dir: 0, nextAt: 0 },
  };
  /** Skip acting on the very first frame so the press that opened the menu does not leak in. */
  private primed = false;

  constructor(
    scene: Phaser.Scene,
    items: MenuItem[],
    style: MenuStyle,
    opts: { onBack?: () => void } = {}
  ) {
    this.scene = scene;
    this.items = items;
    this.onBack = opts.onBack;
    this.style = {
      labelSize: 18,
      valueSize: 16,
      ...style,
    };

    this.buildKeys();
    this.buildRows();
    this.refresh();
  }

  get selectedIndex(): number {
    return this.index;
  }

  /** Advances the menu one frame. Pass the active pad, or undefined if none. */
  update(pad: Phaser.Input.Gamepad.Gamepad | undefined): void {
    const now = this.scene.time.now;

    const padUp = pad ? pad.up || pad.leftStick.y < -STICK_THRESHOLD : false;
    const padDown = pad ? pad.down || pad.leftStick.y > STICK_THRESHOLD : false;
    const padLeft = pad ? pad.left || pad.leftStick.x < -STICK_THRESHOLD : false;
    const padRight = pad ? pad.right || pad.leftStick.x > STICK_THRESHOLD : false;
    const padA = pad ? pad.A : false;
    const padB = pad ? pad.B : false;

    // On the first frame, only record input states so a carried-over press
    // (the A/Enter that opened this menu) does not immediately fire.
    if (!this.primed) {
      this.prevPad = { up: padUp, down: padDown, left: padLeft, right: padRight, a: padA, b: padB };
      this.primed = true;
      return;
    }

    const kbUp = this.justDown('UP') || this.justDown('W');
    const kbDown = this.justDown('DOWN') || this.justDown('S');
    const kbLeft = this.isDown('LEFT') || this.isDown('A');
    const kbRight = this.isDown('RIGHT') || this.isDown('D');

    // Vertical navigation: keyboard is edge-triggered by JustDown, the pad edge
    // and held repeat come through the repeat helper.
    let vertical = 0;
    if (kbUp) vertical -= 1;
    if (kbDown) vertical += 1;
    const padVertical = this.repeat('v', this.dirValue(padUp, padDown), now);
    if (vertical === 0) vertical = padVertical;
    if (vertical !== 0) this.move(vertical);

    // Horizontal adjust on the selected value row, with held repeat on all inputs.
    const kbH = this.dirValue(kbLeft, kbRight);
    const combinedH = kbH !== 0 ? kbH : this.dirValue(padLeft, padRight);
    const current = this.items[this.index];
    const allowRepeat = current.kind === 'value' ? current.repeatable !== false : false;
    const horizontal = this.repeat('h', combinedH, now, allowRepeat);
    if (horizontal !== 0) this.adjust(horizontal);

    const selectPressed =
      this.justDown('ENTER') || this.justDown('SPACE') || (padA && !this.prevPad.a);
    if (selectPressed) this.activate();

    const backPressed = this.justDown('ESC') || (padB && !this.prevPad.b);
    if (backPressed && this.onBack) this.onBack();

    this.prevPad = { up: padUp, down: padDown, left: padLeft, right: padRight, a: padA, b: padB };
  }

  /** Removes every game object and input capture this controller created. */
  destroy(): void {
    this.caret.destroy();
    for (const label of this.labels) label.destroy();
    for (const value of this.values) value?.destroy();
  }

  private buildKeys(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) {
      return;
    }
    const names = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D', 'ENTER', 'SPACE', 'ESC'];
    for (const name of names) {
      this.keys[name] = kb.addKey(name);
    }
    // Stop the arrows and space scrolling the page while a menu is open.
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,ENTER,W,A,S,D,ESC');
  }

  private buildRows(): void {
    const { x, top, rowHeight, width, labelSize, valueSize } = this.style;
    const leftX = x - width / 2;
    const rightX = x + width / 2;

    this.caret = this.scene.add
      .text(leftX - 20, top, '▸', {
        fontFamily: FONTS.mono,
        fontSize: `${labelSize}px`,
        color: PALETTE.amber,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(5);

    this.items.forEach((item, i) => {
      const y = top + i * rowHeight;

      const label = this.scene.add
        .text(leftX, y, item.label, {
          fontFamily: FONTS.mono,
          fontSize: `${labelSize}px`,
          color: PALETTE.text,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.setIndex(i));
      label.on('pointerdown', () => {
        this.setIndex(i);
        this.activate();
      });
      this.labels.push(label);

      if (item.kind === 'value') {
        const value = this.scene.add
          .text(rightX, y, '', {
            fontFamily: FONTS.mono,
            fontSize: `${valueSize}px`,
            color: PALETTE.amber,
          })
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(5)
          .setInteractive({ useHandCursor: true });
        // Clicking the value cycles it upward; the left/right controls give both
        // directions, this is just a convenient mouse nudge.
        value.on('pointerover', () => this.setIndex(i));
        value.on('pointerdown', () => {
          this.setIndex(i);
          this.adjust(1);
        });
        this.values.push(value);
      } else {
        this.values.push(null);
      }
    });
  }

  private move(dir: number): void {
    const step = dir < 0 ? -1 : 1;
    const n = this.items.length;
    this.index = (this.index + step + n) % n;
    this.refresh();
  }

  private setIndex(i: number): void {
    this.index = i;
    this.refresh();
  }

  private activate(): void {
    const item = this.items[this.index];
    if (item.kind === 'action') {
      item.onSelect();
    }
  }

  private adjust(dir: number): void {
    const item = this.items[this.index];
    if (item.kind === 'value') {
      item.adjust(dir < 0 ? -1 : 1);
      this.refresh();
    }
  }

  /** Repaints the caret position, row colours and every value display. */
  private refresh(): void {
    const { top, rowHeight } = this.style;
    this.caret.setY(top + this.index * rowHeight);
    this.labels.forEach((label, i) => {
      label.setColor(i === this.index ? PALETTE.amber : PALETTE.text);
    });
    this.items.forEach((item, i) => {
      if (item.kind === 'value') {
        this.values[i]?.setText(item.getDisplay());
      }
    });
  }

  private dirValue(neg: boolean, pos: boolean): -1 | 0 | 1 {
    if (neg && !pos) return -1;
    if (pos && !neg) return 1;
    return 0;
  }

  /**
   * Immediate-then-repeat gating for a held direction. Returns the step, or 0.
   * The fresh press always fires; the timed auto-repeat only fires when
   * allowRepeat is true, so a two-state toggle changes once per press.
   */
  private repeat(axis: 'v' | 'h', value: -1 | 0 | 1, now: number, allowRepeat = true): -1 | 0 | 1 {
    const state = this.repeatState[axis];
    if (value === 0) {
      state.dir = 0;
      return 0;
    }
    if (value !== state.dir) {
      state.dir = value;
      state.nextAt = now + REPEAT_INITIAL_MS;
      return value;
    }
    if (allowRepeat && now >= state.nextAt) {
      state.nextAt = now + REPEAT_INTERVAL_MS;
      return value;
    }
    return 0;
  }

  private justDown(name: string): boolean {
    const key = this.keys[name];
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  private isDown(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }
}
