import { describe, expect, it } from 'vitest';

import { UPGRADE_NODES } from '@/constants/masters/upgrades';
import type { UpgradeNodeMaster } from '@/constants/masters/types';

import {
  computeUpgradeBonus,
  validateUpgradePurchase,
  ZERO_UPGRADE_BONUS,
  type UpgradeBonus,
} from './apply-upgrades';

function node(overrides: Partial<UpgradeNodeMaster> & { code: string }): UpgradeNodeMaster {
  return {
    name: overrides.code,
    description: overrides.code,
    effect: { type: 'startHpPct', valuePerRank: 5 },
    maxRank: 1,
    costPerRank: [100],
    prerequisiteCode: null,
    sortOrder: 1,
    ...overrides,
  };
}

describe('computeUpgradeBonus', () => {
  it('未購入（空Map）はZERO_UPGRADE_BONUSと一致する', () => {
    expect(computeUpgradeBonus(new Map(), UPGRADE_NODES)).toEqual(ZERO_UPGRADE_BONUS);
  });

  it('HP系3段すべて購入で+15%（累計）', () => {
    const ranks = new Map([
      ['upg_hp_1', 1],
      ['upg_hp_2', 1],
      ['upg_hp_3', 1],
    ]);
    const bonus = computeUpgradeBonus(ranks, UPGRADE_NODES);
    expect(bonus.startHpPct).toBe(15);
    expect(bonus.startAtkPct).toBe(0);
  });

  it('ATK系3段すべて購入で+9%（累計）', () => {
    const ranks = new Map([
      ['upg_atk_1', 1],
      ['upg_atk_2', 1],
      ['upg_atk_3', 1],
    ]);
    expect(computeUpgradeBonus(ranks, UPGRADE_NODES).startAtkPct).toBe(9);
  });

  it('ゴールド・リロール・レリック・シャード獲得%の合算', () => {
    const ranks = new Map([
      ['upg_gold_1', 1],
      ['upg_gold_2', 1],
      ['upg_reroll_1', 1],
      ['upg_relic_1', 1],
      ['upg_shard_1', 1],
      ['upg_shard_2', 1],
    ]);
    const bonus = computeUpgradeBonus(ranks, UPGRADE_NODES);
    expect(bonus.startGoldFlat).toBe(100);
    expect(bonus.rerollBonus).toBe(1);
    expect(bonus.startRelicCount).toBe(1);
    expect(bonus.shardGainPct).toBe(20);
  });

  it('rank未満（0や未登録）は加算されない', () => {
    const ranks = new Map([['upg_hp_1', 0]]);
    expect(computeUpgradeBonus(ranks, UPGRADE_NODES)).toEqual(ZERO_UPGRADE_BONUS);
  });

  it('CORE_SPEC §5.9: startHpPct/startAtkPctは+30%でクランプされる（将来のマスタ拡張への防御）', () => {
    const overGrownNodes: UpgradeNodeMaster[] = [
      node({ code: 'x_hp_1', effect: { type: 'startHpPct', valuePerRank: 20 } }),
      node({ code: 'x_hp_2', effect: { type: 'startHpPct', valuePerRank: 20 } }),
      node({ code: 'x_atk_1', effect: { type: 'startAtkPct', valuePerRank: 40 } }),
    ];
    const ranks = new Map([
      ['x_hp_1', 1],
      ['x_hp_2', 1],
      ['x_atk_1', 1],
    ]);
    const bonus: UpgradeBonus = computeUpgradeBonus(ranks, overGrownNodes);
    expect(bonus.startHpPct).toBe(30);
    expect(bonus.startAtkPct).toBe(30);
  });

  it('maxRank>1の一般式（rank × valuePerRank）に対応する', () => {
    const nodes: UpgradeNodeMaster[] = [
      node({
        code: 'x_gold',
        effect: { type: 'startGold', valuePerRank: 30 },
        maxRank: 3,
        costPerRank: [50, 100, 150],
      }),
    ];
    expect(computeUpgradeBonus(new Map([['x_gold', 2]]), nodes).startGoldFlat).toBe(60);
  });
});

describe('validateUpgradePurchase', () => {
  const hp1 = UPGRADE_NODES.find((n) => n.code === 'upg_hp_1')!;
  const hp2 = UPGRADE_NODES.find((n) => n.code === 'upg_hp_2')!;
  const reroll1 = UPGRADE_NODES.find((n) => n.code === 'upg_reroll_1')!; // prerequisite = upg_gold_1

  it('正常購入: 次段のコストを返す', () => {
    expect(
      validateUpgradePurchase({ node: hp1, currentRank: 0, targetRank: 1, prerequisiteRank: 0 }),
    ).toEqual({ cost: 100 });
  });

  it('前提ノード（upg_hp_1）を購入済みならupg_hp_2を購入できる（各ノードmaxRank=1の独立ノード設計）', () => {
    expect(
      validateUpgradePurchase({ node: hp2, currentRank: 0, targetRank: 1, prerequisiteRank: 1 }),
    ).toEqual({ cost: 250 });
  });

  it('未知のノード → RangeError("unknown upgrade node")', () => {
    expect(() =>
      validateUpgradePurchase({
        node: undefined,
        currentRank: 0,
        targetRank: 1,
        prerequisiteRank: 0,
      }),
    ).toThrow('unknown upgrade node');
  });

  it('購入済み段の再送 → RangeError("already purchased")', () => {
    expect(() =>
      validateUpgradePurchase({ node: hp1, currentRank: 1, targetRank: 1, prerequisiteRank: 0 }),
    ).toThrow('already purchased');
    // targetRankが現在rankを下回る場合も同様
    expect(() =>
      validateUpgradePurchase({ node: hp2, currentRank: 2, targetRank: 1, prerequisiteRank: 1 }),
    ).toThrow('already purchased');
  });

  it('飛ばし購入 → RangeError("invalid target rank")', () => {
    expect(() =>
      validateUpgradePurchase({ node: hp1, currentRank: 0, targetRank: 2, prerequisiteRank: 0 }),
    ).toThrow('invalid target rank');
  });

  it('maxRank超過 → RangeError("invalid target rank")', () => {
    expect(() =>
      validateUpgradePurchase({ node: hp1, currentRank: 1, targetRank: 2, prerequisiteRank: 0 }),
    ).toThrow('invalid target rank');
  });

  it('前提ノード未達成 → RangeError("prerequisite not met")', () => {
    expect(() =>
      validateUpgradePurchase({
        node: reroll1,
        currentRank: 0,
        targetRank: 1,
        prerequisiteRank: 0,
      }),
    ).toThrow('prerequisite not met');
  });

  it('前提ノード達成済みなら購入できる', () => {
    expect(
      validateUpgradePurchase({
        node: reroll1,
        currentRank: 0,
        targetRank: 1,
        prerequisiteRank: 1,
      }),
    ).toEqual({ cost: 300 });
  });
});
