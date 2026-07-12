import { SecurityCueArbitrator, type SecurityCue } from './audioPolicy';

/** Arbitrates near-simultaneous detections and prevents repeated-state cue spam. */
export class SecurityCueCoordinator {
  private readonly arbitrator = new SecurityCueArbitrator(250);
  private readonly lastOfferedAt = new Map<SecurityCue, number>();

  constructor(
    private readonly play: (cue: SecurityCue) => void,
    private readonly repeatLimitMs = 900
  ) {}

  offer(cue: SecurityCue, nowMs: number): boolean {
    const last = this.lastOfferedAt.get(cue);
    if (last !== undefined && nowMs - last < this.repeatLimitMs) return false;
    this.lastOfferedAt.set(cue, nowMs);
    const result = this.arbitrator.offer(cue, nowMs);
    if (result.readyCue) this.play(result.readyCue);
    return true;
  }

  flush(nowMs: number): SecurityCue | null {
    const cue = this.arbitrator.takeReady(nowMs);
    if (cue) this.play(cue);
    return cue;
  }
}
