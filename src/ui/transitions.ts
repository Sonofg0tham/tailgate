import Phaser from 'phaser';

/**
 * Scene transitions (Phase 21). Every screen used to hard-cut into the next;
 * now each fades through the near-black base colour, which is what makes a
 * string of screens feel like one piece of software. The fades are short,
 * eased, and never flash: the screen only ever darkens and brightens.
 */
export const FADE = {
  outMs: 240,
  inMs: 360,
} as const;

/** The near-black base, as the three channels the camera fade wants. */
const BASE_RGB = [14, 17, 22] as const;

/** Scenes mid-fade-out, so a second press cannot start a second departure. */
const leaving = new WeakSet<Phaser.Scene>();

/** Brings a freshly created scene up from the base colour. */
export function fadeIn(scene: Phaser.Scene, ms: number = FADE.inMs): void {
  scene.cameras.main.fadeIn(ms, ...BASE_RGB);
}

/**
 * Fades the scene down, then runs `action` (a scene start or restart). Calls
 * made while a fade is already running are dropped, so double presses and
 * held buttons cannot queue up two departures.
 *
 * The switch rides the scene clock rather than the camera's completion
 * event: the clock and the fade advance on the same game step, and a timer
 * cannot be lost if something else restarts the camera effect mid-fade. The
 * departing flag is cleared on shutdown as well, so a scene that leaves by
 * any other route can still fade out the next time it is visited.
 */
export function fadeOutThen(
  scene: Phaser.Scene,
  action: () => void,
  ms: number = FADE.outMs
): void {
  if (leaving.has(scene)) {
    return;
  }
  leaving.add(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaving.delete(scene));
  scene.cameras.main.fadeOut(ms, ...BASE_RGB);
  scene.time.delayedCall(ms, () => {
    leaving.delete(scene);
    action();
  });
}

/** Fades this scene out and starts another in its place. */
export function fadeToScene(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  ms: number = FADE.outMs
): void {
  fadeOutThen(scene, () => scene.scene.start(key, data), ms);
}
