export type SampleGroup =
  | `footstep:${'carpet' | 'tile' | 'concrete'}`
  | 'bolt-throw' | 'metal-impact' | 'badge-accept' | 'badge-deny'
  | 'door-latch' | 'shutter' | 'breaker-trip' | 'camera-return'
  | 'plant-complete' | 'document-stamp';

export interface SampleDefinition {
  id: string;
  path: string;
  sourceFilename: string;
  sourceUrl: string;
  author: 'Kenney';
  licence: 'CC0 1.0';
  groups: SampleGroup[];
}

const RPG = 'https://kenney.nl/assets/rpg-audio';
const UI = 'https://kenney.nl/assets/interface-sounds';
const sample = (id: string, sourceFilename: string, sourceUrl: string, groups: SampleGroup[]): SampleDefinition => ({
  id, path: `/assets/audio/${id}.ogg`, sourceFilename, sourceUrl, author: 'Kenney', licence: 'CC0 1.0', groups,
});

export const SAMPLE_MANIFEST: readonly SampleDefinition[] = [
  sample('footstep-carpet-1', 'cloth1.ogg', RPG, ['footstep:carpet']),
  sample('footstep-carpet-2', 'cloth2.ogg', RPG, ['footstep:carpet']),
  sample('footstep-carpet-3', 'cloth3.ogg', RPG, ['footstep:carpet']),
  sample('footstep-carpet-4', 'cloth4.ogg', RPG, ['footstep:carpet']),
  sample('footstep-tile-1', 'footstep00.ogg', RPG, ['footstep:tile']),
  sample('footstep-tile-2', 'footstep01.ogg', RPG, ['footstep:tile']),
  sample('footstep-tile-3', 'footstep02.ogg', RPG, ['footstep:tile']),
  sample('footstep-tile-4', 'footstep03.ogg', RPG, ['footstep:tile']),
  sample('footstep-concrete-1', 'footstep04.ogg', RPG, ['footstep:concrete']),
  sample('footstep-concrete-2', 'footstep05.ogg', RPG, ['footstep:concrete']),
  sample('footstep-concrete-3', 'footstep06.ogg', RPG, ['footstep:concrete']),
  sample('footstep-concrete-4', 'footstep07.ogg', RPG, ['footstep:concrete']),
  sample('bolt-throw', 'drawKnife1.ogg', RPG, ['bolt-throw']),
  sample('metal-impact-1', 'metalPot1.ogg', RPG, ['metal-impact']),
  sample('metal-impact-2', 'metalPot2.ogg', RPG, ['metal-impact']),
  sample('metal-impact-3', 'metalPot3.ogg', RPG, ['metal-impact']),
  sample('badge-accept', 'confirmation_001.ogg', UI, ['badge-accept']),
  sample('badge-deny', 'error_001.ogg', UI, ['badge-deny']),
  sample('door-latch', 'metalLatch.ogg', RPG, ['door-latch']),
  sample('shutter', 'creak2.ogg', RPG, ['shutter']),
  sample('breaker-trip', 'switch_003.ogg', UI, ['breaker-trip']),
  sample('camera-return', 'toggle_002.ogg', UI, ['camera-return']),
  sample('plant-complete', 'confirmation_003.ogg', UI, ['plant-complete']),
  sample('document-stamp', 'bookPlace1.ogg', RPG, ['document-stamp']),
] as const;

export function samplesFor(group: SampleGroup): readonly SampleDefinition[] {
  return SAMPLE_MANIFEST.filter((entry) => entry.groups.includes(group));
}
