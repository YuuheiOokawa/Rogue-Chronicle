// 永続強化ツリー（upgrade_nodes）の適用・購入検証（純関数。docs/13 API-204 / docs/09 SCR-106 /
// CORE_SPEC §5.9 / docs/05_Game_Design.md §5.4）。
// - computeUpgradeBonus: player_upgrades（所持rank）+ upgrade_nodesマスタから、ラン開始時に
//   反映するボーナス合算値を導出する（呼び出し側=API-303がcreateInitialRunStateへ渡す）。
// - validateUpgradePurchase: API-204購入時の状態遷移検証（前提/段数/上限）。costの算出のみ行い、
//   実際の通貨減算・DB更新はUseCase/route側の責務とする（domain層はPrisma禁止のため）。
import type { UpgradeNodeMaster } from '@/constants/masters/types';

/** ラン開始時に反映する永続強化の合算ボーナス（run-state.ts createInitialRunStateへ渡す） */
export interface UpgradeBonus {
  startHpPct: number;
  startAtkPct: number;
  startGoldFlat: number;
  /** 0 or 1（現マスタでは startRelic 効果を持つノードは最大1つのみのため） */
  startRelicCount: number;
  rerollBonus: number;
  shardGainPct: number;
}

/** 永続強化を1つも購入していない状態（run-state.test.ts等、強化未購入前提のテストで再利用する） */
export const ZERO_UPGRADE_BONUS: UpgradeBonus = {
  startHpPct: 0,
  startAtkPct: 0,
  startGoldFlat: 0,
  startRelicCount: 0,
  rerollBonus: 0,
  shardGainPct: 0,
};

/** CORE_SPEC §5.9: 永続強化の総和はステータス+30%以内に制限（安全策のクランプ上限） */
const STAT_BONUS_CAP_PCT = 30;

/**
 * computeUpgradeBonus（docs/13 API-204 / API-303補助）。
 * ranksは「所持rank」（player_upgrades行が無いノードは0扱い＝呼び出し側でMapに含めなくてよい）。
 * 各ノードについて rank分の valuePerRank を effect.typeごとに単純合算する（maxRank>1の将来拡張にも
 * 対応できるよう rank × valuePerRank の一般式とする。現マスタは全ノードmaxRank=1のため rank は0か1）。
 * startHpPct/startAtkPctは CORE_SPEC §5.9 の上限+30%を超えないよう防御的にクランプする
 * （現マスタの理論上限は15%/9%でありクランプは発火しないが、将来マスタ拡張時の安全策として実装する）。
 */
export function computeUpgradeBonus(
  ranks: ReadonlyMap<string, number>,
  nodes: readonly UpgradeNodeMaster[],
): UpgradeBonus {
  const bonus = { ...ZERO_UPGRADE_BONUS };

  for (const node of nodes) {
    const rank = ranks.get(node.code) ?? 0;
    if (rank <= 0) continue;
    const total = node.effect.valuePerRank * rank;
    switch (node.effect.type) {
      case 'startHpPct':
        bonus.startHpPct += total;
        break;
      case 'startAtkPct':
        bonus.startAtkPct += total;
        break;
      case 'startGold':
        bonus.startGoldFlat += total;
        break;
      case 'startRelic':
        bonus.startRelicCount += total;
        break;
      case 'rerollPlus':
        bonus.rerollBonus += total;
        break;
      case 'shardGainPct':
        bonus.shardGainPct += total;
        break;
    }
  }

  bonus.startHpPct = Math.min(STAT_BONUS_CAP_PCT, bonus.startHpPct);
  bonus.startAtkPct = Math.min(STAT_BONUS_CAP_PCT, bonus.startAtkPct);
  return bonus;
}

/** validateUpgradePurchaseの入力 */
export interface ValidateUpgradePurchaseParams {
  node: UpgradeNodeMaster | undefined;
  /** そのノードの現在rank（player_upgrades行が無ければ0） */
  currentRank: number;
  /** リクエストの目標rank（docs/13 API-204: 二重購入検知用に「購入後の段数」を明示させる） */
  targetRank: number;
  /**
   * 前提ノード（prerequisiteCode）の現在rank。prerequisiteCodeがnullなら未使用。
   * 現マスタは前提ノードが全てmaxRank=1のため「1以上あれば前提達成」の単純判定でよい
   * （将来 maxRank>1 の前提ノードを扱う場合は、呼び出し側が
   *  「前提ノードのmaxRank」との比較まで行った上でこの引数を渡すよう拡張する想定）。
   */
  prerequisiteRank: number;
}

/**
 * validateUpgradePurchase（docs/13 API-204 手順2）。
 * 検証のみ行い、通過したら次段のコストを返す（通貨減算はroute/UseCase側でTx実行する）。
 * エラーはRangeErrorのmessageで種別を判別し、呼び出し側でAppErrorへ変換する:
 *   'unknown upgrade node'   → ERR_NOT_FOUND
 *   'already purchased'      → ERR_REWARD_ALREADY_CLAIMED
 *   'invalid target rank'    → ERR_INVALID_ACTION（飛ばし購入・maxRank超過）
 *   'prerequisite not met'   → ERR_INVALID_ACTION
 */
export function validateUpgradePurchase(params: ValidateUpgradePurchaseParams): { cost: number } {
  const { node, currentRank, targetRank, prerequisiteRank } = params;

  if (!node) {
    throw new RangeError('unknown upgrade node');
  }
  if (targetRank <= currentRank) {
    throw new RangeError('already purchased');
  }
  if (targetRank !== currentRank + 1 || targetRank > node.maxRank) {
    throw new RangeError('invalid target rank');
  }
  if (node.prerequisiteCode !== null && prerequisiteRank < 1) {
    throw new RangeError('prerequisite not met');
  }

  return { cost: node.costPerRank[targetRank - 1] };
}
