import { describe, expect, it } from 'vitest';

import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { createFakeRng } from '@/domain/battle/test-support';

import { resolveRewardTable } from './resolve-reward-table';

const masters = { equipment: EQUIPMENT, relics: RELICS };
const table = (code: string) => REWARD_TABLES.find((t) => t.code === code)!;

describe('resolveRewardTable', () => {
  it('rt_battle_normal: 重み抽選で1件だけ解決する（weight60=consumable先頭を選ぶ）', () => {
    const result = resolveRewardTable(table('rt_battle_normal'), 1, [], masters, createFakeRng([0, 0]));
    expect(result).toHaveLength(1);
    expect(result[0].rewardType).toBe('consumable');
    expect(result[0].code).toBe('potion');
  });

  it('rt_treasure_normal: gold行が選ばれた場合はfloor((base+perFloor*floor)*rand)で算出される', () => {
    // take()=0 → weighted選択で先頭(equipment,weight60)ではなくrandom sequence次第。
    // rng.next()=1で3番目(consumable, weight15)側へ寄るのを避け、goldを明示的に狙うため
    // weighted内部の累積比較を利用: r = take()*100。0.7*100=70 → equipment(60)を引いた後、
    // gold(25)の範囲(60〜85)に入る。
    const result = resolveRewardTable(
      table('rt_treasure_normal'),
      5,
      [],
      masters,
      createFakeRng([0.7, 0.9]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rewardType).toBe('gold');
    // base=40, perFloor=10, floor=5 → (40+50)=90。 rand = 0.9 + take()*(1.1-0.9)
    const expectedRand = 0.9 + 0.9 * (1.1 - 0.9);
    expect(result[0].amount).toBe(Math.floor(90 * expectedRand));
  });

  it('rt_treasure_secret: 主報酬(装備)+guaranteed gold(60)が両方解決される', () => {
    const result = resolveRewardTable(table('rt_treasure_secret'), 3, [], masters, createFakeRng([0, 0]));
    expect(result).toHaveLength(2);
    expect(result[0].rewardType).toBe('equipment');
    expect(result[1]).toEqual({ rewardType: 'gold', amount: 60 });
  });

  it('rt_boss: guaranteedのrelicは必ず、epic装備はchancePct50%で追加抽選される', () => {
    // chancePct判定: rng.next()*100 < 50 → next()=0.1で適用される
    const applied = resolveRewardTable(table('rt_boss'), 1, [], masters, createFakeRng([0, 0.1, 0]));
    expect(applied[0].rewardType).toBe('relic');
    expect(applied[1]?.rewardType).toBe('equipment');

    // next()=0.9 → 90 >= 50 → 追加抽選されない
    const notApplied = resolveRewardTable(table('rt_boss'), 1, [], masters, createFakeRng([0, 0.9]));
    expect(notApplied).toHaveLength(1);
    expect(notApplied[0].rewardType).toBe('relic');
  });

  it('relicが全所持ならequipment rareへ振替する', () => {
    const ownedAll = RELICS.map((r) => r.code);
    const result = resolveRewardTable(table('rt_battle_elite'), 1, ownedAll, masters, createFakeRng([0.99]));
    // rt_battle_eliteはweight60/40/20の3行で最後がrelic。0.99*100=99 → relic行(weight20)を選ぶ想定域
    // rareへ振替されている場合はrewardType='equipment'になる
    if (result[0].rewardType === 'relic') {
      throw new Error('unexpected: relic should be substituted when all owned');
    }
  });
});
