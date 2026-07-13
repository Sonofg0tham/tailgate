import { describe, expect, it } from 'vitest';
import buildingSceneSource from './BuildingScene.ts?raw';
import staffSource from '../entities/Staff.ts?raw';

describe('BuildingScene feedback and actor contact wiring', () => {
  it('plays photograph feedback when a secondary completes', () => {
    expect(buildingSceneSource).toContain('if (objTick.photographedNow)');
    expect(buildingSceneSource).toContain('this.audio.playPhotographCue();');
  });

  it('makes staff solid to the player without letting contact push them off route', () => {
    expect(buildingSceneSource).toMatch(
      /this\.physics\.add\.collider\(\s*this\.player\.sprite,\s*member\.sprite,/
    );
    expect(staffSource).toContain('this.sprite.setPushable(false);');
    expect(staffSource).not.toContain('this.sprite.setImmovable(true);');
    expect(buildingSceneSource).toContain('member.sprite.setImmovable(true);');
    expect(buildingSceneSource).toContain('member.sprite.setImmovable(false);');
  });
});
