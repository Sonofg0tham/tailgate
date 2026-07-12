import { THROW } from '../config/throw';

/**
 * Presentation-only visibility for the throw trajectory. Controller input is
 * immediate, then eases away once the stick returns to its deadzone.
 */
export class AimDisplayState {
  private controllerReleaseAgeMs = Number.POSITIVE_INFINITY;
  private mouseIdleAgeMs = Number.POSITIVE_INFINITY;
  private mouseInitialised = false;
  private mouseX = 0;
  private mouseY = 0;

  update(input: {
    dtMs: number;
    controllerEngaged: boolean;
    mouseX: number;
    mouseY: number;
  }): number {
    const mouseMoved =
      this.mouseInitialised && (input.mouseX !== this.mouseX || input.mouseY !== this.mouseY);
    this.mouseInitialised = true;
    this.mouseX = input.mouseX;
    this.mouseY = input.mouseY;
    this.mouseIdleAgeMs = mouseMoved ? 0 : this.mouseIdleAgeMs + input.dtMs;

    if (input.controllerEngaged) {
      this.controllerReleaseAgeMs = 0;
    } else {
      this.controllerReleaseAgeMs += input.dtMs;
    }

    const controllerAlpha = Math.max(
      0,
      1 - this.controllerReleaseAgeMs / THROW.aimFadeMs
    );
    const mouseAlpha = Math.max(
      0,
      1 - Math.max(0, this.mouseIdleAgeMs - THROW.mouseAimHoldMs) / THROW.aimFadeMs
    );
    return Math.max(controllerAlpha, mouseAlpha);
  }
}
