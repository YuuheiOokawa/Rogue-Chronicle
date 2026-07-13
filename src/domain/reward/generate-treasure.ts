// 宝箱の内容抽選（docs/20 §2.23 generateTreasureReward / docs/17 §8）。
// TREASUREノード→tableCode='rt_treasure_normal' / SECRETノード→'rt_treasure_secret'
// （どちらを渡すかは呼び出し側=selectNextNode相当のUseCase/domain層が決める）。
// 中身抽選は resolve-reward-table.ts の共通ヘルパを再利用する（calculateBattleRewardと同一ロジック）。
// 戻り値はrun_state.pendingReward（type='treasure'）へそのまま埋め込める形にする。
import type { EquipmentMaster, RelicMaster, RewardTableMaster } from '@/constants/masters/types';
import type { PendingRewardTreasure } from '@/domain/dungeon/run-state';
import type { Rng } from '@/domain/shared/rng';

import { resolveRewardTable } from './resolve-reward-table';

export interface TreasureMasters {
  rewardTables: readonly RewardTableMaster[];
  equipment: readonly EquipmentMaster[];
  relics: readonly RelicMaster[];
}

/**
 * generateTreasureReward（docs/20 §2.23）。
 * 抽選結果はこの時点で確定しpendingRewardに保存する（開封API-503時に再抽選しない＝冪等性）。
 * rt_treasure_normal: 装備60/ゴールド25/消耗品15の1件抽選。
 * rt_treasure_secret: 装備(rare60/epic40)が必ず主報酬 + 固定60Gがボーナスとして常に加算される。
 * （PendingRewardTreasureのrewardTypeは「主報酬」を表し、guaranteedなgold行がある場合は
 *   goldAmountに合算する。主報酬自体がgoldの場合はgoldAmount=主報酬額のみ）
 */
export function generateTreasureReward(
  tableCode: string,
  floor: number,
  ownedRelics: readonly string[],
  masters: TreasureMasters,
  rng: Rng,
): PendingRewardTreasure {
  const table = masters.rewardTables.find((t) => t.code === tableCode);
  if (!table) throw new RangeError(`generateTreasureReward: unknown tableCode=${tableCode}`);

  const resolved = resolveRewardTable(table, floor, ownedRelics, masters, rng);
  if (resolved.length === 0) {
    throw new RangeError(`generateTreasureReward: table ${tableCode} resolved no reward`);
  }

  const [primary, ...rest] = resolved;
  const bonusGold = rest
    .filter((r) => r.rewardType === 'gold')
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const reward: PendingRewardTreasure = {
    type: 'treasure',
    rewardType: primary.rewardType,
    claimed: false,
  };
  if (primary.rewardType === 'equipment') reward.equipmentCode = primary.code;
  if (primary.rewardType === 'consumable') reward.consumableCode = primary.code;
  if (primary.rewardType === 'relic') reward.relicCode = primary.code;
  if (primary.rewardType === 'gold') reward.goldAmount = primary.amount;
  if (bonusGold > 0) reward.goldAmount = (reward.goldAmount ?? 0) + bonusGold;

  return reward;
}
