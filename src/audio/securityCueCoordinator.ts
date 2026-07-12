import { cuePriority, type SecurityCue } from './audioPolicy';

interface PendingCue<T> {
  cue: SecurityCue;
  payload: T;
  playAtMs: number;
}

/** Arbitrates near-simultaneous detections and prevents repeated-state cue spam. */
export class SecurityCueCoordinator<T> {
  private pending: PendingCue<T> | null = null;
  private readonly lastOfferedAt = new Map<SecurityCue, number>();

  constructor(
    private readonly play: (cue: SecurityCue, payload: T) => void,
    private readonly repeatLimitMs = 900
  ) {}

  offer(cue: SecurityCue, nowMs: number, payload: T): boolean {
    if (this.pending && nowMs >= this.pending.playAtMs) {
      this.play(this.pending.cue, this.pending.payload);
      this.pending = null;
    }
    const last = this.lastOfferedAt.get(cue);
    if (last !== undefined && nowMs - last < this.repeatLimitMs) return false;
    this.lastOfferedAt.set(cue, nowMs);
    if (!this.pending) {
      this.pending = { cue, payload, playAtMs: nowMs + 250 };
    } else if (cuePriority(cue) > cuePriority(this.pending.cue)) {
      this.pending = { cue, payload, playAtMs: this.pending.playAtMs };
    }
    return true;
  }

  flush(nowMs: number): SecurityCue | null {
    if (!this.pending || nowMs < this.pending.playAtMs) return null;
    const pending = this.pending;
    this.pending = null;
    this.play(pending.cue, pending.payload);
    return pending.cue;
  }
}
