// キャラクター解放条件の評価（純関数。docs/13 API-201/202/203、CORE_SPEC §5.5）
// マスタ定数の unlockCondition（{type:'initial'|'shards'|'achievement'}）を入力に、
// 「ソウルシャード購入可否・コスト」「実績進捗の表示値」を導出する。
import type { CharacterUnlockCondition } from '@/constants/masters/types';

/** ソウルシャード購入としての解放可否（API-203はshards型のみ購入可） */
export type ShardUnlockEvaluation =
  | { purchasable: true; cost: number }
  | { purchasable: false; reason: 'achievement_locked' | 'not_purchasable' };

/**
 * unlockConditionを「シャード購入」として評価する。
 * - shards型: 購入可。costに必要ソウルシャード数を返す
 * - achievement型: 購入不可（実績解除処理が自動付与する。docs/13 API-203 手順3）
 * - initial型: 購入不可（ユーザー作成時に解放済みのため対象外）
 */
export function evaluateShardUnlock(condition: CharacterUnlockCondition): ShardUnlockEvaluation {
  switch (condition.type) {
    case 'shards':
      return { purchasable: true, cost: condition.amount };
    case 'achievement':
      return { purchasable: false, reason: 'achievement_locked' };
    case 'initial':
      return { purchasable: false, reason: 'not_purchasable' };
  }
}

/** 現在の所持ソウルシャードで解放（購入）できるか。shards型以外は常にfalse */
export function canAffordUnlock(condition: CharacterUnlockCondition, soulShards: number): boolean {
  const evaluation = evaluateShardUnlock(condition);
  return evaluation.purchasable && soulShards >= evaluation.cost;
}

/** 実績進捗の算出に使うプレイヤー累計統計（player_progressのサブセット） */
export interface ProgressStats {
  totalRuns: number;
  totalClears: number;
  totalKills: number;
  bestFloor: number;
}

/**
 * 実績条件タイプに対する現在進捗値を返す。
 * 累計統計に対応しない条件タイプ（ラン内条件等）は0を返す（達成判定はサーバーのfinalize処理が正）。
 */
export function achievementProgressValue(conditionType: string, stats: ProgressStats): number {
  switch (conditionType) {
    case 'totalRuns':
      return stats.totalRuns;
    case 'totalClears':
      return stats.totalClears;
    case 'totalKills':
      return stats.totalKills;
    case 'bestFloor':
      return stats.bestFloor;
    default:
      return 0;
  }
}
