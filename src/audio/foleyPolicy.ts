import { chooseOcclusionCutoff, distanceGain, panForPositions } from './audioPolicy';

export type SampleRole = 'player-step' | 'guard-step' | 'interaction';
export type SampleBus = 'footsteps' | 'guard' | 'foley';

export function sampleBusFor(role: SampleRole): SampleBus {
  return role === 'player-step' ? 'footsteps' : role === 'guard-step' ? 'guard' : 'foley';
}

export function worldFoleyTreatment(
  sourceX: number, sourceY: number, listenerX: number, listenerY: number,
  occluded: boolean, rangePx: number
) {
  const distance = Math.hypot(sourceX - listenerX, sourceY - listenerY);
  return {
    gain: distanceGain(distance, rangePx),
    pan: panForPositions(sourceX, listenerX, 0, rangePx),
    cutoffHz: chooseOcclusionCutoff(occluded, 12000, 900),
  };
}

export class BadgeAttemptEdges {
  private readonly inside = new Set<string>();

  entered(id: string, inRange: boolean): boolean {
    const wasInside = this.inside.has(id);
    if (inRange) this.inside.add(id); else this.inside.delete(id);
    return inRange && !wasInside;
  }
}
