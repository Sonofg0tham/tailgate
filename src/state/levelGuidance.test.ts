import { describe, expect, it } from 'vitest';
import levels from '../../public/data/levels.json';

describe('contract guidance', () => {
  it('tells Building C players what to do inside the server room', () => {
    const buildingC = levels.levels.find((level) => level.id === 'building-c');
    const serverHint = buildingC?.hints.find((hint) => hint.id === 'server-room');

    expect(serverHint?.text).toContain('RACK 4');
    expect(serverHint?.text).toContain('HOLD A OR E');
  });
});
