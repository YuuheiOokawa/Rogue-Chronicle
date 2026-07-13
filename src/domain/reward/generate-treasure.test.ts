import { describe, expect, it } from 'vitest';

import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { createRng } from '@/domain/shared/rng';

import { generateTreasureReward } from './generate-treasure';

const masters = { rewardTables: REWARD_TABLES, equipment: EQUIPMENT, relics: RELICS };

describe('generateTreasureReward', () => {
  it('rt_treasure_normal: rewardTypeは常にequipment/gold/consumableのいずれか、goldAmountは正の整数', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const reward = generateTreasureReward('rt_treasure_normal', 5, [], masters, createRng(seed));
      expect(reward.type).toBe('treasure');
      expect(reward.claimed).toBe(false);
      expect(['equipment', 'gold', 'consumable']).toContain(reward.rewardType);
      if (reward.rewardType === 'equipment') expect(reward.equipmentCode).toBeTruthy();
      if (reward.rewardType === 'consumable') expect(reward.consumableCode).toBeTruthy();
      if (reward.rewardType === 'gold') {
        expect(reward.goldAmount).toBeGreaterThan(0);
        expect(Number.isInteger(reward.goldAmount)).toBe(true);
      }
    }
  });

  it('rt_treasure_normal: 区分確率がおおよそ装備60/ゴールド25/消耗品15に従う（大数統計）', () => {
    const counts = { equipment: 0, gold: 0, consumable: 0 };
    const N = 4000;
    for (let seed = 1; seed <= N; seed += 1) {
      const reward = generateTreasureReward('rt_treasure_normal', 1, [], masters, createRng(seed));
      counts[reward.rewardType as 'equipment' | 'gold' | 'consumable'] += 1;
    }
    expect(counts.equipment / N).toBeGreaterThan(0.52);
    expect(counts.equipment / N).toBeLessThan(0.68);
    expect(counts.gold / N).toBeGreaterThan(0.18);
    expect(counts.gold / N).toBeLessThan(0.32);
    expect(counts.consumable / N).toBeGreaterThan(0.08);
    expect(counts.consumable / N).toBeLessThan(0.22);
  });

  it('rt_treasure_secret: 主報酬は必ずequipment(rare/epic)で、goldAmount=60が常に付与される', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const reward = generateTreasureReward('rt_treasure_secret', 4, [], masters, createRng(seed));
      expect(reward.rewardType).toBe('equipment');
      expect(reward.equipmentCode).toBeTruthy();
      const master = EQUIPMENT.find((e) => e.code === reward.equipmentCode);
      expect(['rare', 'epic']).toContain(master?.rarity);
      expect(reward.goldAmount).toBe(60);
    }
  });

  it('未知のtableCodeは例外', () => {
    expect(() => generateTreasureReward('rt_unknown', 1, [], masters, createRng(1))).toThrow();
  });

  it('開封の冪等性: 同一seed/floorなら常に同一内容を返す（再抽選しない前提の検証）', () => {
    const a = generateTreasureReward('rt_treasure_normal', 3, [], masters, createRng(777));
    const b = generateTreasureReward('rt_treasure_normal', 3, [], masters, createRng(777));
    expect(a).toEqual(b);
  });
});
