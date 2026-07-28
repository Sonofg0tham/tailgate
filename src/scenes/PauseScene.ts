import Phaser from 'phaser';
import { setAudioGameplayPaused } from '../audio/AudioManager';
import { KIOSK } from '../config/kiosk';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import { getActiveLevelId } from '../state/levels';
import { resetMission } from '../state/mission';
import { resetRunStats } from '../state/runStats';
import { getSettings } from '../state/settings';
import { MenuController } from '../ui/MenuController';

/** The badge card geometry, drawn portrait like a real access lanyard. */
const CARD = { x: 480, y: 296, w: 384, h: 448 } as const;
/** The gamepad Start button index in the standard mapping. */
const PAD_START = 9;

/** Anything printed on the badge card, gathered so the card can hang as one. */
type BadgePart =
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Graphics;

/**
 * The pause screen, styled as a lanyard access badge per the identity spec. It
 * overlays the frozen building. Resume, restart the engagement, abandon it for
 * the contract schedule, or open settings. Pressing Start again or Escape
 * resumes, so a pad player never needs the keyboard.
 *
 * The card hangs off the strap with the faintest sway, so it reads as a real
 * badge on a lanyard rather than a panel pasted on the screen.
 */
export class PauseScene extends Phaser.Scene {
  private menu!: MenuController;
  private prevStart = false;
  /** Skip the first frame so the Start press that opened pause does not resume it. */
  private startPrimed = false;
  /** The hanging card and its sway, held so SCREEN EFFECTS can still it. */
  private badge!: Phaser.GameObjects.Container;
  private swayTween?: Phaser.Tweens.Tween;

  constructor() {
    super('pause');
  }

  create(): void {
    // Dim the frozen game behind the badge.
    this.add.rectangle(480, 270, 960, 540, PALETTE_HEX.base, 0.72);
    this.drawLanyard();

    const top = CARD.y - CARD.h / 2;
    // Everything printed on the card, collected so it can hang as one piece.
    const parts: BadgePart[] = [];

    parts.push(
      this.add
        .rectangle(CARD.x, CARD.y, CARD.w, CARD.h, PALETTE_HEX.sheet)
        .setStrokeStyle(1, PALETTE_HEX.amber, 0.9)
    );

    // Amber header band with dark text, like the coloured strip on a real badge.
    parts.push(this.add.rectangle(CARD.x, top + 20, CARD.w, 34, PALETTE_HEX.amber));
    parts.push(
      this.add
        .text(CARD.x, top + 20, 'SECURITY CLEARANCE / PAUSED', {
          fontFamily: FONTS.mono,
          fontSize: '13px',
          color: PALETTE.base,
        })
        .setOrigin(0.5)
    );

    // Photo placeholder and identity block.
    const photoX = CARD.x - CARD.w / 2 + 60;
    parts.push(
      this.add.rectangle(photoX, top + 118, 84, 104, 0x0e1116).setStrokeStyle(1, PALETTE_HEX.text, 0.5)
    );
    parts.push(
      this.add
        .text(photoX, top + 118, 'NO\nPHOTO', {
          fontFamily: FONTS.mono,
          fontSize: '11px',
          color: PALETTE.text,
          align: 'center',
        })
        .setOrigin(0.5)
    );

    const infoX = photoX + 62;
    parts.push(
      this.add.text(infoX, top + 78, 'C. MCCART', {
        fontFamily: FONTS.display,
        fontSize: '26px',
        color: PALETTE.amber,
      })
    );
    const lines = ['RED TEAM CONSULTANT', 'SONOFG0THAM SECURITY', 'CLEARANCE   AMBER', 'ID   TG-0007'];
    let ly = top + 116;
    for (const line of lines) {
      parts.push(
        this.add.text(infoX, ly, line, { fontFamily: FONTS.mono, fontSize: '12px', color: PALETTE.text })
      );
      ly += 18;
    }

    // Divider and a decorative barcode strip.
    parts.push(this.add.rectangle(CARD.x, top + 210, CARD.w - 48, 1, PALETTE_HEX.amber, 0.4));
    parts.push(this.drawBarcode(top + 232));

    this.hangBadge(parts, top - 8);

    this.menu = new MenuController(
      this,
      [
        { kind: 'action', label: 'RESUME', onSelect: () => this.resume() },
        { kind: 'action', label: 'RESTART ENGAGEMENT', onSelect: () => this.restart() },
        { kind: 'action', label: 'ABANDON ENGAGEMENT', onSelect: () => this.abandon() },
        { kind: 'action', label: 'SETTINGS', onSelect: () => this.openSettings() },
      ],
      { x: CARD.x, top: top + 292, rowHeight: 34, width: 320, labelSize: 19 },
      { onBack: () => this.resume() }
    );

    this.add
      .text(480, CARD.y + CARD.h / 2 + 16, 'Start or Esc resumes', {
        fontFamily: FONTS.mono,
        fontSize: '11px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tweens.killAll());
  }

  /**
   * Hangs the card off the lanyard clip. The tilt is about a third of a degree
   * either side of straight over nearly four seconds: enough that the badge
   * reads as a physical thing on a strap, small and slow enough to be
   * comfortable to sit in front of.
   *
   * The action rows are not part of the card group, they belong to the shared
   * menu controller. At this amplitude that costs a couple of pixels of drift
   * at the card's bottom edge, which is well below noticing, and it keeps the
   * menu's mouse hit areas exactly where they have always been.
   */
  private hangBadge(parts: BadgePart[], pivotY: number): void {
    // The scene object is reused across pauses; forget the last visit's tween.
    this.swayTween = undefined;
    this.badge = this.add.container(CARD.x, pivotY, parts);
    // The parts were laid out in screen coordinates; rebase them on the clip.
    for (const part of parts) {
      part.x -= CARD.x;
      part.y -= pivotY;
    }
    // The sway is looping dressing, so it rides the SCREEN EFFECTS setting
    // like the kiosk's loops, re-checked when the settings sheet resumes us.
    this.applySwaySetting();
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.applySwaySetting());
  }

  /** Starts or stills the badge sway to match the SCREEN EFFECTS setting. */
  private applySwaySetting(): void {
    const on = getSettings().screenEffects;
    if (on && !this.swayTween) {
      this.badge.setRotation(-KIOSK.badgeSway.amplitudeRad);
      this.swayTween = this.tweens.add({
        targets: this.badge,
        rotation: KIOSK.badgeSway.amplitudeRad,
        duration: KIOSK.badgeSway.swingMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!on) {
      this.swayTween?.remove();
      this.swayTween = undefined;
      this.badge.setRotation(0);
    }
  }

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;

    // Start toggles pause, so pressing it again here resumes.
    const startDown = pad?.buttons?.[PAD_START]?.pressed ?? false;
    if (!this.startPrimed) {
      this.prevStart = startDown;
      this.startPrimed = true;
      this.menu.update(pad);
      return;
    }
    if (startDown && !this.prevStart) {
      this.resume();
      return;
    }
    this.prevStart = startDown;

    this.menu.update(pad);
  }

  private resume(): void {
    setAudioGameplayPaused(false);
    this.scene.stop();
    this.scene.resume('building');
  }

  private restart(): void {
    // Restart the same contract from the van: fresh mission, same level.
    resetMission(getActiveLevelId());
    resetRunStats();
    this.scene.stop();
    this.scene.start('building');
  }

  /**
   * Walks off the job and back to the contract schedule. The run in progress
   * is discarded; the contract's best rating and unlocks are untouched, so
   * nothing is lost beyond the attempt itself.
   */
  private abandon(): void {
    resetMission();
    resetRunStats();
    this.scene.stop('building');
    this.scene.stop();
    this.scene.start('contracts');
  }

  private openSettings(): void {
    this.scene.launch('settings', { returnScene: 'pause' });
    this.scene.pause();
  }

  /** A short lanyard strap running from the top of the screen into the badge clip. */
  private drawLanyard(): void {
    const g = this.add.graphics();
    const top = CARD.y - CARD.h / 2;
    g.fillStyle(PALETTE_HEX.amber, 0.5);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(456, 0),
        new Phaser.Math.Vector2(472, 0),
        new Phaser.Math.Vector2(484, top - 6),
        new Phaser.Math.Vector2(474, top - 6),
      ],
      true
    );
    g.fillPoints(
      [
        new Phaser.Math.Vector2(504, 0),
        new Phaser.Math.Vector2(488, 0),
        new Phaser.Math.Vector2(476, top - 6),
        new Phaser.Math.Vector2(486, top - 6),
      ],
      true
    );
    // The metal clip that fixes the badge to the strap.
    g.fillStyle(PALETTE_HEX.text, 0.8);
    g.fillRect(472, top - 8, 16, 8);
  }

  /** A faux barcode, purely decorative badge detail. */
  private drawBarcode(y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(PALETTE_HEX.text, 0.75);
    let x = CARD.x - 120;
    const widths = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 4, 1, 2];
    for (let i = 0; i < widths.length; i++) {
      if (i % 2 === 0) {
        g.fillRect(x, y, widths[i], 26);
      }
      x += widths[i] + 2;
    }
    return g;
  }
}
