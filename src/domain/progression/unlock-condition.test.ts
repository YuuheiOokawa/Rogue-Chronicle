import { describe, expect, it } from 'vitest';

import type { CharacterUnlockCondition } from '@/constants/masters/types';

import {
  achievementProgressValue,
  canAffordUnlock,
  evaluateShardUnlock,
  type ProgressStats,
} from './unlock-condition';

const shards300: CharacterUnlockCondition = { type: 'shards', amount: 300 };
const byAchievement: CharacterUnlockCondition = {
  type: 'achievement',
  achievementCode: 'ach_runs_10',
};
const initial: CharacterUnlockCondition = { type: 'initial' };

describe('evaluateShardUnlock', () => {
  it('shards型は購入可でコストを返す', () => {
    expect(evaluateShardUnlock(shards300)).toEqual({ purchasable: true, cost: 300 });
  });

  it('achievement型は購入不可（実績で解放）', () => {
    expect(evaluateShardUnlock(byAchievement)).toEqual({
      purchasable: false,
      reason: 'achievement_locked',
    });
  });

  it('initial型は購入不可（初期解放のため対象外）', () => {
    expect(evaluateShardUnlock(initial)).toEqual({
      purchasable: false,
      reason: 'not_purchasable',
    });
  });
});

describe('canAffordUnlock', () => {
  it('残高がコスト以上ならtrue（ちょうども可）', () => {
    expect(canAffordUnlock(shards300, 300)).toBe(true);
    expect(canAffordUnlock(shards300, 1250)).toBe(true);
  });

  it('残高不足ならfalse', () => {
    expect(canAffordUnlock(shards300, 299)).toBe(false);
    expect(canAffordUnlock(shards300, 0)).toBe(false);
  });

  it('shards型以外は残高に関わらずfalse', () => {
    expect(canAffordUnlock(byAchievement, 99999)).toBe(false);
    expect(canAffordUnlock(initial, 99999)).toBe(false);
  });
});

describe('achievementProgressValue', () => {
  const stats: ProgressStats = { totalRuns: 7, totalClears: 2, totalKills: 130, bestFloor: 9 };

  it('累計統計に対応する条件タイプは現在値を返す', () => {
    expect(achievementProgressValue('totalRuns', stats)).toBe(7);
    expect(achievementProgressValue('totalClears', stats)).toBe(2);
    expect(achievementProgressValue('totalKills', stats)).toBe(130);
    expect(achievementProgressValue('bestFloor', stats)).toBe(9);
  });

  it('累計統計で表せない条件タイプは0を返す', () => {
    expect(achievementProgressValue('runLevel', stats)).toBe(0);
    expect(achievementProgressValue('codexRatePct', stats)).toBe(0);
  });
});
