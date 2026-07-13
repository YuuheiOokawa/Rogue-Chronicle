// バフ/デバフ/状態異常による実効値計算の唯一の実装（docs/20 実装時の注意点: 重複禁止）。
// CORE_SPEC §5.3/§6.2: 実効値 = floor(基礎値 × バフデバフ乗算 × 状態異常乗算)。
// バフデバフ乗算は「同一ステータスに作用する%値を加算してから1つの乗数にする」
// （atkUp+25% と atkDown-25% が同時に存在する場合は net 0% として合成）。
// 状態異常（burn/weaken）は別枠の乗数として掛け合わせる
// （例: atkUp1.25 × burn0.90 = 実効atk×1.125。CORE_SPEC §6.2の例に一致）。
import type { BuffCode, BuffInstance, CombatStats, DebuffCode, StatusInstance } from './types';

function buffValue(buffs: readonly BuffInstance[], code: BuffCode | DebuffCode): number {
  return buffs.find((b) => b.code === code)?.value ?? 0;
}

function hasStatus(statuses: readonly StatusInstance[], code: StatusInstance['code']): boolean {
  return statuses.some((s) => s.code === code);
}

/** atkUp/atkDownの合成%とburn(-10%)を反映した実効atk */
export function effectiveAtk(
  stats: CombatStats,
  buffs: readonly BuffInstance[],
  statuses: readonly StatusInstance[],
): number {
  const pct = buffValue(buffs, 'atkUp') - buffValue(buffs, 'atkDown');
  const statusMult = hasStatus(statuses, 'burn') ? 0.9 : 1;
  return Math.floor(stats.atk * (1 + pct / 100) * statusMult);
}

/** defUp/defDownの合成%とweaken(-25%)を反映した実効def */
export function effectiveDef(
  stats: CombatStats,
  buffs: readonly BuffInstance[],
  statuses: readonly StatusInstance[],
): number {
  const pct = buffValue(buffs, 'defUp') - buffValue(buffs, 'defDown');
  const statusMult = hasStatus(statuses, 'weaken') ? 0.75 : 1;
  return Math.floor(stats.def * (1 + pct / 100) * statusMult);
}

/** spdUp/spdDownの合成%を反映した実効spd */
export function effectiveSpd(stats: CombatStats, buffs: readonly BuffInstance[]): number {
  const pct = buffValue(buffs, 'spdUp') - buffValue(buffs, 'spdDown');
  return Math.floor(stats.spd * (1 + pct / 100));
}

/** critUpは加算合成（CORE_SPEC §6.2「critUpのみ加算合成」）。0-100にclamp */
export function effectiveCritRate(stats: CombatStats, buffs: readonly BuffInstance[]): number {
  const value = stats.critRate + buffValue(buffs, 'critUp');
  return Math.min(100, Math.max(0, value));
}

/** MVPではcritDmgへのバフ源が定義されていないため基礎値をそのまま返す */
export function effectiveCritDmg(stats: CombatStats): number {
  return stats.critDmg;
}

/** MVPではevaへのバフ源が定義されていないため基礎値をそのまま返す */
export function effectiveEva(stats: CombatStats): number {
  return stats.eva;
}

/** MVPではaccへのバフ源が定義されていないため基礎値をそのまま返す */
export function effectiveAcc(stats: CombatStats): number {
  return stats.acc;
}

/** MVPではstatusResへのバフ源が定義されていないため基礎値をそのまま返す */
export function effectiveStatusRes(stats: CombatStats): number {
  return stats.statusRes;
}

/**
 * バフ/デバフの付与（docs/20 §2.11疑似コード）。
 * 同種は「効果値が大きい方を採用し、持続ターンは長い方」で上書きする。
 */
export function applyBuff(current: readonly BuffInstance[], next: BuffInstance): BuffInstance[] {
  const rest = current.filter((b) => b.code !== next.code);
  const prev = current.find((b) => b.code === next.code);
  const merged: BuffInstance = prev
    ? {
        code: next.code,
        value: Math.max(prev.value, next.value),
        remainingTurns: Math.max(prev.remainingTurns, next.remainingTurns),
      }
    : next;
  return [...rest, merged];
}

/** applyDebuffはapplyBuffと同一マージ規則（デバフはvalue/codeの意味方向が異なるだけ） */
export const applyDebuff = applyBuff;

/**
 * ターン終了時: 状態異常・バフ/デバフの残りターンを1減らし、0未満（消化済み）を除去する。
 * poison/burn等のダメージ処理はstatus-effects.tsのresolveStatusTickで別途行う。
 */
export function tickStatusAndBuffTurns(
  statuses: readonly StatusInstance[],
  buffs: readonly BuffInstance[],
): { statuses: StatusInstance[]; buffs: BuffInstance[] } {
  return {
    statuses: statuses
      .map((s) => ({ ...s, remainingTurns: s.remainingTurns - 1 }))
      .filter((s) => s.remainingTurns > 0),
    buffs: buffs
      .map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 }))
      .filter((b) => b.remainingTurns > 0),
  };
}
