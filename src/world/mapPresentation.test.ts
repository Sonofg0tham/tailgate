import { describe, expect, it } from 'vitest';
import { readDecorationLayer, selectKnownDecorations } from './mapPresentation';

describe('Tiled presentation layers', () => {
  it('treats a missing decals layer as empty', () => {
    expect(readDecorationLayer(undefined)).toEqual([]);
  });

  it('defaults rotation, scale and alpha for presentation objects', () => {
    expect(
      readDecorationLayer({ objects: [{ name: 'floor_mark', x: 20, y: 30 }] })
    ).toEqual([
      {
        key: 'floor_mark',
        x: 20,
        y: 30,
        rotation: 0,
        scale: 1,
        alpha: 1,
      },
    ]);
  });

  it('preserves Tiled rotation and custom scale and alpha values', () => {
    expect(
      readDecorationLayer({
        objects: [
          {
            name: 'floor_mark',
            x: 20,
            y: 30,
            rotation: 90,
            properties: [
              { name: 'scale', value: 0.75 },
              { name: 'alpha', value: 0.4 },
            ],
          },
        ],
      })
    ).toEqual([
      {
        key: 'floor_mark',
        x: 20,
        y: 30,
        rotation: 90,
        scale: 0.75,
        alpha: 0.4,
      },
    ]);
  });
});

describe('decal render policy', () => {
  it('warns and skips decals whose texture was not loaded', () => {
    const warnings: string[] = [];
    const items = readDecorationLayer({
      objects: [
        { name: 'known', x: 10, y: 20 },
        { name: 'missing', x: 30, y: 40 },
      ],
    });

    expect(
      selectKnownDecorations(items, (key) => key === 'known', 'decal', (message) => {
        warnings.push(message);
      })
    ).toEqual([items[0]]);
    expect(warnings).toEqual(['Unknown decal texture "missing" at 30,40']);
  });
});
