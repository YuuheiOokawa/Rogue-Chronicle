// 実績条件評価（docs/20 §2.30 grantPersistentRewards内 evaluateCondition / CORE_SPEC §11実績10種）。
// AchievementMaster.condition.type は10種類（totalRuns/totalClears/totalDefeats/totalKills/
// eliteKills/runLevel/runRelicsHeld/runGoldHeld/codexRatePct/bestFloor）で、いずれも
// 「PlayerStatsSnapshotの同名フィールド >= condition.value」という単純な比較に正規化できるため、
// type→フィールド名の対応表を用意する必要はなく、conditionのtypeをそのままキーとして参照する。
import type { AchievementMaster } from '@/constants/masters/types';

export type AchievementCondition = AchievementMaster['condition'];

/**
 * 実績条件評価に必要な統計スナップショット。
 * totalRuns/totalClears/totalDefeats/totalKills/eliteKills/bestFloor はDB（player_progress）由来
 * （grantPersistentRewards内で「今回のラン分を加算した後」の値を渡すこと）。
 * runLevel/runRelicsHeld/runGoldHeld/codexRatePct はfinalize時点のrun_state・図鑑発見率から
 * 算出した値（1ラン内の値。DBの累計とは別軸）。
 */
export interface PlayerStatsSnapshot {
  totalRuns: number;
  totalClears: number;
  totalDefeats: number;
  totalKills: number;
  eliteKills: number;
  bestFloor: number;
  runLevel: number;
  runRelicsHeld: number;
  runGoldHeld: number;
  codexRatePct: number;
}

/** evaluateAchievementCondition（docs/20 §2.30）。stats[condition.type] >= condition.value */
export function evaluateAchievementCondition(
  condition: AchievementCondition,
  stats: PlayerStatsSnapshot,
): boolean {
  return stats[condition.type] >= condition.value;
}
