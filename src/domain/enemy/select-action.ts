// 敵AI行動決定（docs/20 §2.16 / docs/19 §2 完全ランダム禁止アルゴリズム）。
// 「条件ルール優先評価 → 重み付き抽選」の2段構成 + 同一行動3連続禁止。
import type { EnemyActionDef, EnemyAiRuleDef } from '@/constants/masters/types';
import type { Rng } from '@/domain/shared/rng';

import type { EnemyInstance, EnemyIntent } from '../battle/types';

/**
 * selectEnemyActionの入力コンテキスト。
 * docs/20の擬似コードは { turnNo, bossPhase, aliveEnemyCount, playerHpPct } の4項目だが、
 * docs/19 §2.2の条件DSL（targetStatusMissing/allyBuffMissing/phaseShiftPending/turnsInPhaseMod）を
 * 正しく評価するには追加情報が必要なため、以下4項目を任意で拡張している（実装判断。docs未記載分）。
 * 未指定時は「該当なし=false寄り」の安全側デフォルトで評価する。
 */
export interface EnemyActionContext {
  /** このintent決定が対象とする「実行されるターン番号」（turnModは次ターン番号で評価。docs/19実装注意2） */
  turnNo: number;
  bossPhase: 1 | 2 | 3 | null;
  /** 自身を含む敵側の現在生存数 */
  aliveEnemyCount: number;
  /** プレイヤーの hp/maxHp（0〜1） */
  playerHpPct: number;
  /** targetStatusMissing条件用: 現在プレイヤーに付与されている状態異常コード一覧 */
  playerStatusCodes?: readonly string[];
  /** allyBuffMissing条件用: 敵側生存者全員が該当バフコードを保持していればtrue */
  alliesAllHaveBuff?: (code: string) => boolean;
  /** phaseShiftPending条件用: 直前のターン終了処理でフェーズ移行が発生したか */
  phaseShiftPending?: boolean;
  /** turnsInPhaseMod条件用: 現フェーズ突入後の経過ターン数 */
  turnsInCurrentPhase?: number;
}

function evalConditionKey(
  key: string,
  value: unknown,
  enemy: EnemyInstance,
  ctx: EnemyActionContext,
): boolean {
  switch (key) {
    case 'hpBelow':
      return enemy.hp / enemy.stats.maxHp < (value as number);
    case 'hpAbove':
      return enemy.hp / enemy.stats.maxHp > (value as number);
    case 'playerHpBelow':
      return ctx.playerHpPct < (value as number);
    case 'turnMod': {
      const v = value as { n: number; eq: number };
      return ctx.turnNo % v.n === v.eq;
    }
    case 'selfBuffMissing':
      return !enemy.buffs.some((b) => b.code === value);
    case 'allyBuffMissing':
      return ctx.alliesAllHaveBuff ? !ctx.alliesAllHaveBuff(value as string) : true;
    case 'targetStatusMissing':
      return !(ctx.playerStatusCodes ?? []).includes(value as string);
    case 'allyCount': {
      const v = value as { lt?: number; gte?: number };
      if (v.lt !== undefined && !(ctx.aliveEnemyCount < v.lt)) return false;
      if (v.gte !== undefined && !(ctx.aliveEnemyCount >= v.gte)) return false;
      return true;
    }
    case 'phaseShiftPending':
      return Boolean(ctx.phaseShiftPending) === (value as boolean);
    case 'turnsInPhaseMod': {
      const v = value as { n: number; eq: number };
      return (ctx.turnsInCurrentPhase ?? 0) % v.n === v.eq;
    }
    default:
      return false; // 未知キーはfalse扱い（前方互換。docs/19 §2.2）
  }
}

function evalCondition(
  conditions: Record<string, unknown> | null,
  enemy: EnemyInstance,
  ctx: EnemyActionContext,
): boolean {
  if (conditions === null) return false; // 基本テーブル行はここでは評価しない
  return Object.entries(conditions).every(([key, value]) => evalConditionKey(key, value, enemy, ctx));
}

/** 選択候補が「3連続目」になるか（enemy.recentActionCodesは最新が先頭） */
function wouldBeThirdInRow(recentActionCodes: readonly string[], actionCode: string): boolean {
  return recentActionCodes[0] === actionCode && recentActionCodes[1] === actionCode;
}

export function selectEnemyAction(
  enemy: EnemyInstance,
  aiRules: readonly EnemyAiRuleDef[],
  actions: readonly EnemyActionDef[],
  ctx: EnemyActionContext,
  rng: Rng,
): EnemyIntent {
  const sorted = [...aiRules].sort((a, b) => a.priority - b.priority);

  const matched: EnemyAiRuleDef[] = [];
  let matchedPriority: number | null = null;
  for (const rule of sorted) {
    if (rule.conditions === null) continue; // 基本テーブル行は後段で使用
    if (matchedPriority !== null && rule.priority !== matchedPriority) break; // 最小priority群のみ
    if (evalCondition(rule.conditions, enemy, ctx)) {
      matched.push(rule);
      matchedPriority = rule.priority;
    }
  }

  const basePool = sorted.filter((r) => r.conditions === null);
  const pool = matched.length > 0 ? matched : basePool;
  if (pool.length === 0) {
    throw new Error(`selectEnemyAction: no base weight table found for enemy ${enemy.code}`);
  }

  const filtered = pool.filter((r) => !wouldBeThirdInRow(enemy.recentActionCodes, r.actionCode));
  const candidates = filtered.length > 0 ? filtered : pool; // 候補が空になったら制限を無視

  const picked = rng.weighted(candidates.map((r) => ({ item: r, weight: r.weight })));
  const action = actions.find((a) => a.code === picked.actionCode);
  if (!action) {
    throw new Error(`selectEnemyAction: actionCode ${picked.actionCode} not found in actions`);
  }
  return { actionCode: action.code, label: action.intentLabel, icon: action.intentIcon };
}
