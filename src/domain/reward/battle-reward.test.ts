import { describe, expect, it } from 'vitest';

import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { createFakeRng } from '@/domain/battle/test-support';

import { calculateBattleReward } from './battle-reward';

const masters = { rewardTables: REWARD_TABLES, equipment: EQUIPMENT, relics: RELICS };

describe('calculateBattleReward', () => {
  it('EXP式が一致する（Σ baseExp × 階層係数 × expMod）', () => {
    const r = calculateBattleReward(
      [{ baseExp: 10, baseGold: 14 }],
      5,
      1.0,
      1.0,
      null,
      [],
      masters,
      createFakeRng([0.5]),
    );
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
      null,
      [],
      masters,
      createFakeRng([0.5, 0.5]),
    );
    expect(r.exp).toBe(18);
  });

  it('goldは敵ごとにrng.int(baseGold×0.8,baseGold×1.2)を消費し、階層係数×rewardModを乗算する', () => {
    // rng.next()=0 → int(min,max)の最小値
    const r = calculateBattleReward(
      [{ baseExp: 10, baseGold: 100 }],
      1,
      1.0,
      1.0,
      null,
      [],
      masters,
      createFakeRng([0]),
    );
    expect(r.gold).toBe(80); // min=round(100*0.8)=80, 階層係数1.0, rewardMod1.0
  });

  it('rewardModが乗算される', () => {
    const r = calculateBattleReward(
      [{ baseExp: 10, baseGold: 100 }],
      1,
      1.0,
      2.0,
      null,
      [],
      masters,
      createFakeRng([0]),
    );
    expect(r.gold).toBe(160);
  });

  it('dropTableCode=nullならdropsは空配列', () => {
    const r = calculateBattleReward(
      [{ baseExp: 10, baseGold: 10 }],
      1,
      1.0,
      1.0,
      null,
      [],
      masters,
      createFakeRng([0.5]),
    );
    expect(r.drops).toEqual([]);
  });

  it('敵0体ならgold/exp/soulShardsとも0', () => {
    const r = calculateBattleReward([], 5, 1.0, 1.0, null, [], masters, createFakeRng([0.5]));
    expect(r.gold).toBe(0);
    expect(r.exp).toBe(0);
    expect(r.soulShards).toBe(0);
  });

  it('soulShardsはenemyTypeごとに合算される（docs/05 §5.4: 通常4/強敵8/エリート15/ボス40）', () => {
    const r = calculateBattleReward(
      [
        { baseExp: 1, baseGold: 1, enemyType: 'normal' },
        { baseExp: 1, baseGold: 1, enemyType: 'strong' },
        { baseExp: 1, baseGold: 1, enemyType: 'elite' },
        { baseExp: 1, baseGold: 1, enemyType: 'boss' },
      ],
      1,
      1.0,
      1.0,
      null,
      [],
      masters,
      createFakeRng([0]),
    );
    expect(r.soulShards).toBe(4 + 8 + 15 + 40);
  });

  it('enemyType省略時はnormal扱い', () => {
    const r = calculateBattleReward(
      [{ baseExp: 1, baseGold: 1 }],
      1,
      1.0,
      1.0,
      null,
      [],
      masters,
      createFakeRng([0]),
    );
    expect(r.soulShards).toBe(4);
  });

  it('dropTableCode=rt_battle_normalで中身が抽選され、gold型はdropsに入らずgoldへ合算される', () => {
    // weighted選択の最初の乱数でconsumable行（weight60/100）を選ばせ、続いてitemWeightsからpotionを選ばせる
    const r = calculateBattleReward(
      [{ baseExp: 0, baseGold: 0 }],
      1,
      1.0,
      1.0,
      'rt_battle_normal',
      [],
      masters,
      createFakeRng([0, 0]),
    );
    expect(r.drops).toEqual([{ itemType: 'consumable', code: 'potion' }]);
  });

  it('dropTableCode=rt_treasure_secretのようなgold guaranteed行はgoldに合算される（rt_boss経由の例）', () => {
    // rt_bossはweightedプールが無くguaranteedのみ: 1件目relic必ず適用、2件目equipment epicはchancePct50%
    // rng消費順: (1) baseGold=0でもrng.int(0,0)を1回消費 (2) relic pick (3) equipment chancePct判定
    const r = calculateBattleReward(
      [{ baseExp: 0, baseGold: 0 }],
      1,
      1.0,
      1.0,
      'rt_boss',
      [],
      masters,
      createFakeRng([0, 0, 0.99]), // chancePct判定(0.99*100=99 >= 50 → 適用されない)
    );
    expect(r.drops.length).toBe(1);
    expect(r.drops[0].itemType).toBe('relic');
  });

  it('未知のdropTableCodeは例外', () => {
    expect(() =>
      calculateBattleReward(
        [{ baseExp: 0, baseGold: 0 }],
        1,
        1.0,
        1.0,
        'rt_unknown',
        [],
        masters,
        createFakeRng([0]),
      ),
    ).toThrow();
  });
});
