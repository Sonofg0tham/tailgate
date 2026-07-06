import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';

import Phaser from 'phaser';
import { PALETTE } from './config/palette';
import { BuildingScene } from './scenes/BuildingScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { ReportScene } from './scenes/ReportScene';
import { SettingsScene } from './scenes/SettingsScene';
import { getSettings } from './state/settings';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/**
 * Canvas text cannot use a web font until the browser has finished loading it,
 * so wait for both families before the game boots. Falls through after a
 * short timeout rather than blocking the game on a slow font fetch.
 */
async function waitForFonts(): Promise<void> {
  const fonts = [
    document.fonts.load('600 48px "Saira Condensed"'),
    document.fonts.load('400 16px "IBM Plex Mono"'),
  ];
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.all(fonts), timeout]);
}

async function boot(): Promise<void> {
  await waitForFonts();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: PALETTE.base,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      // Flip debug to true to see Arcade's own collision boxes while tuning.
      arcade: { debug: false },
    },
    input: {
      gamepad: true,
    },
    // The kiosk boots first; it starts the building. Pause and settings are
    // overlays launched on top of whatever is running.
    scene: [MenuScene, BuildingScene, ReportScene, PauseScene, SettingsScene],
  });

  // Dev-only handles for manual inspection. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
    (window as unknown as { __settings: typeof getSettings }).__settings = getSettings;
  }
}

void boot();
