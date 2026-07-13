import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS } from '@/constants/masters/achievements';

import { evaluateAchievementCondition, type PlayerStatsSnapshot } from './achievement-conditions';

const baseStats: PlayerStatsSnapshot = {
  totalRuns: 0,
  totalClears: 0,
  totalDefeats: 0,
  totalKills: 0,
  eliteKills: 0,
  bestFloor: 0,
  runLevel: 0,
  runRelicsHeld: 0,
  runGoldHeld: 0,
  codexRatePct: 0,
};

describe('evaluateAchievementCondition', () => {
  it('全10種の実績条件typeを評価できる', () => {
    for (const a of ACHIEVEMENTS) {
      // 未達成
      expect(evaluateAchievementCondition(a.condition, baseStats)).toBe(false);
      // 達成
      const met = { ...baseStats, [a.condition.type]: a.condition.value };
      expect(evaluateAchievementCondition(a.condition, met)).toBe(true);
    }
  });

  it('value以上であれば達成扱い（超過も可）', () => {
    const condition = ACHIEVEMENTS.find((a) => a.code === 'ach_kills_100')!.condition;
    expect(evaluateAchievementCondition(condition, { ...baseStats, totalKills: 150 })).toBe(true);
    expect(evaluateAchievementCondition(condition, { ...baseStats, totalKills: 99 })).toBe(false);
  });
});
