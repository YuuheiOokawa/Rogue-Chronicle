// ダメージ計算の単一実装（CORE_SPEC §5.4 / docs/20 §2.8〜§2.10）。
// この関数群以外でダメージ・命中・クリティカルを計算しないこと。
import type { Rng } from '@/domain/shared/rng';

import type { Element } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 命中判定（docs/20 §2.10）。戻り値trueは「回避された」ことを意味する。
 * hit% = clamp(95 + acc - eva, 50, 100)
 */
export function calculateEvasion(attackerAcc: number, defenderEva: number, rng: Rng): boolean {
  const hit = clamp(95 + attackerAcc - defenderEva, 50, 100);
  return rng.next() * 100 >= hit;
}

/**
 * クリティカル判定（docs/20 §2.9）。critRateは呼び出し側でeffectiveCritRate適用済みのものを渡す。
 */
export function calculateCritical(critRate: number, rng: Rng): boolean {
  return rng.next() * 100 < clamp(critRate, 0, 100);
}

/** 属性有利表（CORE_SPEC §5.2）: fire→wind, wind→water, water→fire が有利 */
export const ELEMENT_ADVANTAGE: Record<Element, Element | null> = {
  fire: 'wind',
  wind: 'water',
  water: 'fire',
  none: null,
};

export interface CalculateDamageParams {
  /** 攻撃側の実効atk（effectiveAtk適用済み） */
  atk: number;
  /** 防御側の実効def（effectiveDef適用済み） */
  def: number;
  /** 通常攻撃1.0 / スキル0.8〜3.0 */
  skillMult: number;
  /** 攻撃の属性 */
  element: Element;
  /** 防御側の属性 */
  defenderElement: Element;
  /** 防御側の対応属性耐性%（上限50%で軽減。呼び出し側でclamp前の値を渡してよい） */
  defenderElemRes: number;
  /** calculateCriticalの結果 */
  isCrit: boolean;
  /** 防御側の実効critDmg基準ではなく攻撃側のcritDmg（%。基本150） */
  critDmg: number;
  /** 防御側が防御コマンド選択中か（最終ダメージ50%減） */
  guarding: boolean;
  rng: Rng;
}

/**
 * ダメージ計算（docs/20 §2.8）。
 * ダメージ = max(1, floor(atk × skillMult × 100/(100+def) × elemMod × critMod × rand(0.90〜1.10)))
 * elemMod: 有利1.25 / 不利0.75 / 等倍1.0、さらに defenderElemRes%（上限50）で軽減。
 * guarding時は最終値を50%（floor）に減じた後、再度max(1,…)を適用する（0ダメージを作らない）。
 */
export function calculateDamage(params: CalculateDamageParams): { damage: number } {
  const { atk, def, skillMult, element, defenderElement, defenderElemRes, isCrit, critDmg, guarding, rng } =
    params;

  let elemMod = 1.0;
  if (element !== 'none') {
    if (ELEMENT_ADVANTAGE[element] === defenderElement) elemMod = 1.25;
    else if (ELEMENT_ADVANTAGE[defenderElement] === element) elemMod = 0.75;
    const res = Math.min(Math.max(defenderElemRes, 0), 50);
    elemMod *= (100 - res) / 100;
  }

  const critMod = isCrit ? critDmg / 100 : 1.0;
  const variance = 0.9 + rng.next() * 0.2;

  let dmg = Math.floor(atk * skillMult * (100 / (100 + def)) * elemMod * critMod * variance);
  if (guarding) dmg = Math.floor(dmg * 0.5);
  return { damage: Math.max(1, dmg) };
}
