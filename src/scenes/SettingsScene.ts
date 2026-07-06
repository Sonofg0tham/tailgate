import Phaser from 'phaser';
import { setAudioMasterVolume, setAudioMuted } from '../audio/AudioManager';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import {
  getSettings,
  setAssistMode,
  setExtraBrightness,
  setHudScale,
  setMasterVolume,
  setMuted,
  setScreenShake,
} from '../state/settings';
import { MenuController } from '../ui/MenuController';

/** Slider bounds and steps. The visibility floor maps 0..1 onto extraBrightness. */
const VOLUME_STEP = 0.05;
const HUD_MIN = 0.8;
const HUD_MAX = 1.4;
const HUD_STEP = 0.1;
const BRIGHT_MAX = 0.5;
const BRIGHT_STEP = 0.05;

/** Data passed in when the menu or pause screen launches settings. */
interface SettingsData {
  /** Scene key to resume and hand focus back to when settings closes. */
  returnScene: string;
}

/**
 * The settings sheet, launched as an overlay over a paused kiosk or pause badge.
 * Every control applies live and persists to localStorage immediately, so a
 * change survives a reload. Fully navigable on the pad: up/down to move, left/
 * right to change, A or Enter on Back, B or Escape to close.
 */
export class SettingsScene extends Phaser.Scene {
  private menu!: MenuController;
  private returnScene = 'menu';

  constructor() {
    super('settings');
  }

  create(data: SettingsData): void {
    this.returnScene = data?.returnScene ?? 'menu';

    // Dim the paused scene behind, then draw the settings card.
    this.add.rectangle(480, 270, 960, 540, PALETTE_HEX.base, 0.9);
    this.add
      .text(480, 74, 'SETTINGS', { fontFamily: FONTS.display, fontSize: '46px', color: PALETTE.amber })
      .setOrigin(0.5);
    this.add
      .text(480, 110, 'ACCESS PREFERENCES', {
        fontFamily: FONTS.mono,
        fontSize: '12px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);
    this.add
      .rectangle(480, 306, 560, 320, 0x151a21)
      .setStrokeStyle(1, PALETTE_HEX.amber, 0.9);

    this.menu = new MenuController(
      this,
      [
        {
          kind: 'value',
          label: 'MASTER VOLUME',
          getDisplay: () => `${Math.round(getSettings().masterVolume * 100)}%`,
          adjust: (d) => this.setVolume(getSettings().masterVolume + d * VOLUME_STEP),
        },
        {
          kind: 'value',
          label: 'MUTE',
          getDisplay: () => (getSettings().muted ? 'ON' : 'OFF'),
          adjust: () => this.toggleMute(),
          repeatable: false,
        },
        {
          kind: 'value',
          label: 'HUD TEXT SCALE',
          getDisplay: () => `${getSettings().hudScale.toFixed(1)}x`,
          adjust: (d) =>
            setHudScale(this.clamp(getSettings().hudScale + d * HUD_STEP, HUD_MIN, HUD_MAX)),
        },
        {
          kind: 'value',
          label: 'SCREEN SHAKE',
          getDisplay: () => (getSettings().screenShake ? 'ON' : 'OFF'),
          adjust: () => setScreenShake(!getSettings().screenShake),
          repeatable: false,
        },
        {
          kind: 'value',
          label: 'VISIBILITY FLOOR',
          getDisplay: () => `${Math.round((getSettings().extraBrightness / BRIGHT_MAX) * 100)}%`,
          adjust: (d) =>
            setExtraBrightness(
              this.clamp(getSettings().extraBrightness + d * BRIGHT_STEP, 0, BRIGHT_MAX)
            ),
        },
        {
          kind: 'value',
          label: 'ASSIST MODE',
          getDisplay: () => (getSettings().assistMode ? 'ON' : 'OFF'),
          adjust: () => setAssistMode(!getSettings().assistMode),
          repeatable: false,
        },
        { kind: 'action', label: 'BACK', onSelect: () => this.close() },
      ],
      { x: 480, top: 190, rowHeight: 38, width: 420, labelSize: 17, valueSize: 16 },
      { onBack: () => this.close() }
    );

    this.add
      .text(
        480,
        498,
        'Left / Right change a value.  Everything saves automatically.  B or Esc goes back.',
        { fontFamily: FONTS.mono, fontSize: '11px', color: PALETTE.text }
      )
      .setOrigin(0.5);
  }

  update(): void {
    const plugin = this.input.gamepad;
    const pad = plugin && plugin.total > 0 ? plugin.getPad(0) : undefined;
    this.menu.update(pad);
  }

  /** Sets volume in settings and applies it to the live mix in one step. */
  private setVolume(v: number): void {
    const clamped = this.clamp(v, 0, 1);
    setMasterVolume(clamped);
    setAudioMasterVolume(clamped);
  }

  /** Flips mute in settings and on the live mix together. */
  private toggleMute(): void {
    const next = !getSettings().muted;
    setMuted(next);
    setAudioMuted(next);
  }

  private close(): void {
    this.scene.resume(this.returnScene);
    this.scene.stop();
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
