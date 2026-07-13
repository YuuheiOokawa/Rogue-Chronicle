import { describe, expect, it } from 'vitest';

import { createFakeRng } from '@/domain/battle/test-support';

import { calculateBattleReward } from './battle-reward';

describe('calculateBattleReward', () => {
  it('EXP式が一致する（Σ baseExp × 階層係数 × expMod）', () => {
    const r = calculateBattleReward([{ baseExp: 10, baseGold: 14 }], 5, 1.0, 1.0, createFakeRng([0.5]));
    expect(r.exp).toBe(Math.round(10 * (1 + 0.1 * 4) * 1.0));
  });

  it('複数体のexpは合算される', () => {
    const r = calculateBattleReward(
      [
        { baseExp: 10, baseGold: 14 },
        { baseExp: 8, baseGold: 10 },
      ],
      1,
      1.0,
      1.0,
      createFakeRng([0.5, 0.5]),
    );
    expect(r.exp).toBe(18);
  });

  it('goldは敵ごとにrng.int(baseGold×0.8,baseGold×1.2)を消費し、階層係数×rewardModを乗算する', () => {
    // rng.next()=0 → int(min,max)の最小値
    const r = calculateBattleReward([{ baseExp: 10, baseGold: 100 }], 1, 1.0, 1.0, createFakeRng([0]));
    expect(r.gold).toBe(80); // min=round(100*0.8)=80, 階層係数1.0, rewardMod1.0
  });

  it('rewardModが乗算される', () => {
    const r = calculateBattleReward([{ baseExp: 10, baseGold: 100 }], 1, 1.0, 2.0, createFakeRng([0]));
    expect(r.gold).toBe(160);
  });

  it('dropsは常に空配列（Phase6ではドロップ抽選未実装）', () => {
    const r = calculateBattleReward([{ baseExp: 10, baseGold: 10 }], 1, 1.0, 1.0, createFakeRng([0.5]));
    expect(r.drops).toEqual([]);
  });

  it('敵0体ならgold/expとも0', () => {
    const r = calculateBattleReward([], 5, 1.0, 1.0, createFakeRng([0.5]));
    expect(r.gold).toBe(0);
    expect(r.exp).toBe(0);
  });
});
