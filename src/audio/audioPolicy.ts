/** Security cues ordered from the least to the most urgent. */
export type SecurityCue =
  | 'guard-curious'
  | 'camera-ping'
  | 'guard-alert'
  | 'camera-alarm';

const SECURITY_CUE_PRIORITY: Record<SecurityCue, number> = {
  'guard-curious': 0,
  'camera-ping': 1,
  'guard-alert': 2,
  'camera-alarm': 3,
};

export function cuePriority(cue: SecurityCue): number {
  return SECURITY_CUE_PRIORITY[cue];
}

/** Equal-power spatial position reduced to the Web Audio stereo pan range. */
export function panForPositions(sourceX: number, listenerX: number, centreX: number, rangePx: number): number {
  if (rangePx <= 0) return 0;
  return Math.max(-1, Math.min(1, (sourceX - listenerX - centreX) / rangePx));
}

export function distanceGain(distancePx: number, rangePx: number): number {
  if (rangePx <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distancePx / rangePx));
}

export function chooseOcclusionCutoff(occluded: boolean, openHz: number, wallHz: number): number {
  return occluded ? wallHz : openHz;
}

/** Ignores tiny physics jitter that should not produce a footstep. */
export function isActuallyMoving(velocityX: number, velocityY: number, thresholdPxPerSecond = 1): boolean {
  return Math.hypot(velocityX, velocityY) > thresholdPxPerSecond;
}

/** Converts completed physics displacement into actual velocity for audio. */
export function velocityFromDisplacement(
  deltaX: number,
  deltaY: number,
  frameMs: number
): { x: number; y: number } {
  if (frameMs <= 0) return { x: 0, y: 0 };
  const framesPerSecond = 1000 / frameMs;
  return { x: deltaX * framesPerSecond, y: deltaY * framesPerSecond };
}

export interface PendingSecurityCue {
  cue: SecurityCue;
  playAtMs: number;
}

export interface SecurityCueOfferResult {
  /** A previous window's winner that became due before this offer. */
  readyCue: SecurityCue | null;
  /** The new or updated window containing this offer. */
  pending: PendingSecurityCue;
}

/** Collects cues briefly so simultaneous detections produce one clear sound. */
export class SecurityCueArbitrator {
  private pending: PendingSecurityCue | null = null;

  constructor(private readonly windowMs = 250) {}

  offer(cue: SecurityCue, nowMs: number): SecurityCueOfferResult {
    let readyCue: SecurityCue | null = null;
    if (this.pending && nowMs >= this.pending.playAtMs) {
      readyCue = this.pending.cue;
      this.pending = null;
    }

    if (!this.pending) {
      this.pending = { cue, playAtMs: nowMs + this.windowMs };
    } else if (cuePriority(cue) > cuePriority(this.pending.cue)) {
      this.pending = { ...this.pending, cue };
    }
    return { readyCue, pending: { ...this.pending } };
  }

  takeReady(nowMs: number): SecurityCue | null {
    if (!this.pending || nowMs < this.pending.playAtMs) return null;
    const cue = this.pending.cue;
    this.pending = null;
    return cue;
  }
}
