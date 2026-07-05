import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';

import Phaser from 'phaser';
import { PALETTE } from './config/palette';
import { BuildingScene } from './scenes/BuildingScene';

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
    scene: [BuildingScene],
  });

  // Dev-only handle for manual inspection. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
}

void boot();
