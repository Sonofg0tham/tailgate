export interface UnlockEventTarget {
  on(event: string, fn: () => void): void;
  off(event: string, fn: () => void): void;
}

/** Owns the three autoplay-unlock inputs as one disposable registration. */
export class AudioUnlockListeners {
  private targets: Array<{ target: UnlockEventTarget; event: string }> = [];
  private armed = false;

  constructor(private readonly unlock: () => void) {}

  arm(
    pointer: UnlockEventTarget,
    keyboard?: UnlockEventTarget,
    gamepad?: UnlockEventTarget
  ): void {
    if (this.armed) return;
    this.armed = true;
    this.add(pointer, 'pointerdown');
    if (keyboard) this.add(keyboard, 'keydown');
    if (gamepad) this.add(gamepad, 'down');
  }

  dispose(): void {
    for (const { target, event } of this.targets) target.off(event, this.handleUnlock);
    this.targets = [];
    this.armed = false;
  }

  private add(target: UnlockEventTarget, event: string): void {
    target.on(event, this.handleUnlock);
    this.targets.push({ target, event });
  }

  private readonly handleUnlock = (): void => {
    this.dispose();
    this.unlock();
  };
}
