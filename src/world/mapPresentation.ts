/** A visual-only sprite placement read from a Tiled object layer. */
export interface DecorationPoint {
  key: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  alpha: number;
}

export interface DecorationLayer {
  objects: readonly TiledDecorationObject[];
}

export interface TiledDecorationObject {
  name?: string;
  x?: number;
  y?: number;
  rotation?: number;
  properties?: readonly { name: string; value: unknown }[];
}

function numberProperty(object: TiledDecorationObject, name: string, fallback: number): number {
  const value = object.properties?.find((property) => property.name === name)?.value;
  return typeof value === 'number' ? value : fallback;
}

/** Missing optional presentation layers are valid and contain no entries. */
export function readDecorationLayer(layer: DecorationLayer | undefined): DecorationPoint[] {
  if (!layer) {
    return [];
  }
  return layer.objects.map((object) => ({
    key: object.name ?? '',
    x: object.x ?? 0,
    y: object.y ?? 0,
    rotation: object.rotation ?? 0,
    scale: numberProperty(object, 'scale', 1),
    alpha: numberProperty(object, 'alpha', 1),
  }));
}

/** Applies the shared warn-and-skip policy before visual sprites are created. */
export function selectKnownDecorations<T extends DecorationPoint>(
  items: readonly T[],
  hasTexture: (key: string) => boolean,
  label: string,
  warn: (message: string) => void = console.warn
): T[] {
  return items.filter((item) => {
    if (hasTexture(item.key)) {
      return true;
    }
    warn(`Unknown ${label} texture "${item.key}" at ${item.x},${item.y}`);
    return false;
  });
}
