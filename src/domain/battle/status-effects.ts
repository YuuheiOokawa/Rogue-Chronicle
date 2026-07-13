// 状態異常の付与・tick処理（docs/20 §2.13 / CORE_SPEC §5.3）。
import type { Rng } from '@/domain/shared/rng';

import type { StatusCode, StatusInstance } from './types';

/** 状態異常の継続ターン（CORE_SPEC §5.3） */
export const STATUS_DURATIONS: Record<StatusCode, number> = {
  poison: 3,
  burn: 2,
  paralysis: 2,
  stun: 1,
  weaken: 3,
};

/**
 * 状態異常の付与判定（docs/20 §2.13）。
 * 成功率 = baseRate × (100 - targetStatusRes) / 100。
 * 重複時（既に同種を保持）はremainingTurnsを規定値へリセットするのみ（効果は重複しない）。
 */
export function applyStatusEffect(
  current: readonly StatusInstance[],
  code: StatusCode,
  successRateBase: number,
  targetStatusRes: number,
  rng: Rng,
): { statuses: StatusInstance[]; applied: boolean } {
  const successRate = successRateBase * (100 - targetStatusRes) / 100;
  const roll = rng.next() * 100;
  if (roll >= successRate) {
    return { statuses: [...current], applied: false };
  }
  const duration = STATUS_DURATIONS[code];
  const exists = current.some((s) => s.code === code);
  const statuses = exists
    ? current.map((s) => (s.code === code ? { ...s, remainingTurns: duration } : s))
    : [...current, { code, remainingTurns: duration }];
  return { statuses, applied: true };
}

export interface StatusTickTarget {
  hp: number;
  maxHp: number;
  statuses: readonly StatusInstance[];
}

export interface StatusTickEntry {
  code: StatusCode;
  damage: number;
}

/**
 * ターン終了時のtickダメージ算出（poison=maxHp8% / burn=maxHp5%。CORE_SPEC §5.3）。
 * 他の状態異常はtickダメージを持たない（0）。regenバフの回復はmodifiers.ts/buffs側で処理する。
 * floor・ダメージ下限1（該当statusを保持している場合のみ）。
 */
export function resolveStatusTick(target: StatusTickTarget): {
  hpDelta: number;
  entries: StatusTickEntry[];
} {
  const entries: StatusTickEntry[] = [];
  if (target.statuses.some((s) => s.code === 'poison')) {
    entries.push({ code: 'poison', damage: Math.max(1, Math.floor(target.maxHp * 0.08)) });
  }
  if (target.statuses.some((s) => s.code === 'burn')) {
    entries.push({ code: 'burn', damage: Math.max(1, Math.floor(target.maxHp * 0.05)) });
  }
  const total = entries.reduce((sum, e) => sum + e.damage, 0);
  return { hpDelta: total === 0 ? 0 : -total, entries };
}

/**
 * 行動不能判定（docs/20 §2.13 / executePlayerAction疑似コード）。
 * stunは必ず不能（決定的なためrngを消費しない）。paralysisは30%で不能（rng 1回消費）。
 * どちらも無ければrng消費なしでfalse。
 */
export function isIncapacitated(statuses: readonly StatusInstance[], rng: Rng): boolean {
  if (statuses.some((s) => s.code === 'stun')) return true;
  if (statuses.some((s) => s.code === 'paralysis')) {
    return rng.next() * 100 < 30;
  }
  return false;
}
