export interface CameraCueEvent {
  id: string;
  sourceX: number;
  sourceY: number;
  investigateX: number;
  investigateY: number;
}

/** Keeps the CCTV housing sound source separate from where it saw the player. */
export function cameraCueEvent(
  id: string,
  sourceX: number,
  sourceY: number,
  investigateX: number,
  investigateY: number
): CameraCueEvent {
  return { id, sourceX, sourceY, investigateX, investigateY };
}
