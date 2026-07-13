// プレイヤーランク計算（CORE_SPEC §5.9）
/** ランク上限（当面50） */
export const RANK_CAP = 50;

/** 次ランクまでの必要ランクEXP: expToRank(R) = floor(100 × R^1.8) */
export function expToNextRank(rank: number): number {
  return Math.floor(100 * Math.pow(rank, 1.8));
}
