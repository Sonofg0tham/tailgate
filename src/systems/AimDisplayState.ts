import { THROW } from '../config/throw';

export interface AimDisplayInput {
  dtMs: number;
  controllerEngaged: boolean;
  mouseX: number;
  mouseY: number;
  aimX: number;
  aimY: number;
}

export interface AimDisplayFrame {
  alpha: number;
  aimX: number;
  aimY: number;
}

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
  private retainedControllerAim: { x: number; y: number } | null = null;

  update(input: AimDisplayInput): AimDisplayFrame {
    const mouseMoved =
      this.mouseInitialised && (input.mouseX !== this.mouseX || input.mouseY !== this.mouseY);
    this.mouseInitialised = true;
    this.mouseX = input.mouseX;
    this.mouseY = input.mouseY;
    this.mouseIdleAgeMs = mouseMoved ? 0 : this.mouseIdleAgeMs + input.dtMs;

    if (input.controllerEngaged) {
      this.controllerReleaseAgeMs = 0;
      this.mouseIdleAgeMs = Number.POSITIVE_INFINITY;
      this.retainedControllerAim = { x: input.aimX, y: input.aimY };
    } else if (mouseMoved) {
      this.controllerReleaseAgeMs = Number.POSITIVE_INFINITY;
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
    if (this.retainedControllerAim && controllerAlpha > 0) {
      return {
        alpha: controllerAlpha,
        aimX: this.retainedControllerAim.x,
        aimY: this.retainedControllerAim.y,
      };
    }
    return { alpha: mouseAlpha, aimX: input.aimX, aimY: input.aimY };
  }
}
