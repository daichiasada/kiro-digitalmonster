import { describe, expect, it } from 'vitest';
import { Stage, STAGE_ORDER } from '@digital-monster/shared';

import { stageImage, STAGE_IMAGE } from '../lib/stageImage';

describe('stageImage', () => {
  it('returns an asset for every stage', () => {
    for (const stage of STAGE_ORDER) {
      const src = stageImage(stage);
      expect(src).toBeTruthy();
      expect(typeof src).toBe('string');
    }
  });

  it('returns a DISTINCT asset for each of the 4 stages', () => {
    const sources = [
      stageImage(Stage.BABY),
      stageImage(Stage.ROOKIE),
      stageImage(Stage.CHAMPION),
      stageImage(Stage.ULTIMATE),
    ];
    const unique = new Set(sources);
    expect(unique.size).toBe(4);
  });

  it('maps the expected per-stage keys', () => {
    expect(STAGE_IMAGE[Stage.BABY]).toBe(stageImage(Stage.BABY));
    expect(STAGE_IMAGE[Stage.ULTIMATE]).toBe(stageImage(Stage.ULTIMATE));
    expect(STAGE_IMAGE[Stage.BABY]).not.toBe(STAGE_IMAGE[Stage.ROOKIE]);
  });
});
