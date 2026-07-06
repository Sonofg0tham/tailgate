import type { ZoneRect } from '../world/BuildingMap';

/**
 * Finds which named zone a point falls in. Pure geometry, no Phaser Graphics
 * involved, so it can be unit tested and reused by the audio subsystem to
 * decide surface and ambience without touching rendering at all.
 *
 * Zones can overlap in the Tiled data (e.g. a doorway zone laid over a room),
 * so this mirrors the render order used elsewhere: the LAST matching zone in
 * the array wins, matching how later objects draw on top of earlier ones.
 */
export function zoneAt(zones: ZoneRect[], x: number, y: number): string | null {
  let found: string | null = null;
  for (const zone of zones) {
    if (x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height) {
      found = zone.name;
    }
  }
  return found;
}
