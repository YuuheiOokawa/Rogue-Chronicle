// プレイヤーランク計算（CORE_SPEC §5.9）
/** ランク上限（当面50） */
export const RANK_CAP = 50;

/** 次ランクまでの必要ランクEXP: expToRank(R) = floor(100 × R^1.8) */
export function expToNextRank(rank: number): number {
  return Math.floor(100 * Math.pow(rank, 1.8));
}

export interface RankProgress {
  rank: number;
  rankExp: number;
}

export interface AddRankExpResult extends RankProgress {
  /** 今回の加算で発生したランクアップ回数（複数段一括対応。docs/20 §2.30） */
  leveledUp: number;
}

/**
 * addRankExp（docs/20 §2.30 grantPersistentRewards内で使用）。
 * gainExperience（progression/experience.ts）と同様に「現ランク内の進行度をrankExpとして持ち、
 * ランクアップのたびにexpToNextRank(rank)分を消費して繰り越す」方式を採用する（一貫性のため）。
 * 上限RANK_CAP（50）で頭打ちとし、以降のexpは消費されず素のまま保持する。
 */
export function addRankExp(progress: RankProgress, gainedExp: number): AddRankExpResult {
  let rank = progress.rank;
  let rankExp = progress.rankExp + gainedExp;
  let leveledUp = 0;

  while (rank < RANK_CAP) {
    const need = expToNextRank(rank);
    if (rankExp < need) break;
    rankExp -= need;
    rank += 1;
    leveledUp += 1;
  }

  return { rank, rankExp, leveledUp };
}
