// スキル/敵行動の effect_type ハンドラ（docs/18 §2.3 13種）。
// 将来のスキル追加＝データ追加のみで済むよう、effect_typeごとに1関数+ディスパッチャで構成する。
// stat_passive/counterはPhase6では「効果適用の記録のみ」（発動条件判定・永続反映はcaller/将来Phase側）。
// shield/revive_guardも同様: run_state側に永続保持スロットが無いため、本Phaseでは結果descriptorの
// 算出のみ行い、実際の吸収・復活ロジックへの配線はPhase7以降の課題とする（判断理由は最終報告に記載）。
import type {
  BuffParams,
  CleanseParams,
  CounterParams,
  DamageAoeParams,
  DamageParams,
  DebuffParams,
  EffectType,
  HealParams,
  LifestealParams,
  ReviveGuardParams,
  ShieldParams,
  SpGainParams,
  StatPassiveParams,
  StatusParams,
} from '@/domain/skill/effect-params';
import type { Rng } from '@/domain/shared/rng';

import { calculateCritical, calculateDamage, calculateEvasion } from './damage';
import { applyStatusEffect, STATUS_DURATIONS } from './status-effects';
import type { BuffInstance, CombatStats, Element, StatusCode, StatusInstance } from './types';

export interface EffectActorCtx {
  id: string;
  element: Element;
  /** 実効ステータス（effectiveAtk等を適用済みのもの） */
  stats: CombatStats;
}

export interface EffectTargetCtx {
  id: string;
  hp: number;
  maxHp: number;
  element: Element;
  /** 攻撃属性に対する耐性%（呼び出し側でマスタから解決。不明時0） */
  elemRes: number;
  /** 実効ステータス（effectiveDef等を適用済みのもの） */
  stats: CombatStats;
  statuses: readonly StatusInstance[];
  buffs: readonly BuffInstance[];
  guarding: boolean;
}

export interface EffectContext {
  actor: EffectActorCtx;
  /** 単体対象は要素1、全体対象は生存対象全て */
  targets: EffectTargetCtx[];
  rng: Rng;
  /** lifesteal参照用: 直前のdamage/damage_aoe効果で与えた合計ダメージ（skill_effects定義順で解決） */
  previousDamage?: number;
}

export interface EffectTargetResult {
  targetId: string;
  /** 負=ダメージ（既にguard減算込み）、正=回復。maxHpへのclampはcaller側で行う */
  hpDelta: number;
  isCrit?: boolean;
  isMiss?: boolean;
  /** ログ表示用（成否のみ）。実際の状態異常リストはnewStatusesを参照 */
  statusApplied?: { code: StatusCode; applied: boolean };
  /** 状態異常が変化した場合の対象の状態異常リスト全体（status/cleanse効果）。callerはtarget.statuses=newStatusesで置換する */
  newStatuses?: StatusInstance[];
  /** 付与するバフ/デバフ。callerはapplyBuff(target.buffs, buffApplied)でマージする */
  buffApplied?: BuffInstance;
}

export interface EffectResult {
  targetResults: EffectTargetResult[];
  actorHpDelta?: number;
  actorSpDelta?: number;
  actorBuffApplied?: BuffInstance;
  /** この効果で与えた合計ダメージ（lifestealの直前参照用。負の値はないので常に0以上） */
  damageDealt: number;
  note?: string;
}

function resolveSingleDamage(
  actor: EffectActorCtx,
  target: EffectTargetCtx,
  mult: number,
  addCritRate: number,
  rng: Rng,
): EffectTargetResult & { dealt: number } {
  const evaded = calculateEvasion(actor.stats.acc, target.stats.eva, rng);
  if (evaded) {
    return { targetId: target.id, hpDelta: 0, isMiss: true, dealt: 0 };
  }
  const critRate = actor.stats.critRate + addCritRate;
  const isCrit = calculateCritical(critRate, rng);
  const { damage } = calculateDamage({
    atk: actor.stats.atk,
    def: target.stats.def,
    skillMult: mult,
    element: actor.element,
    defenderElement: target.element,
    defenderElemRes: target.elemRes,
    isCrit,
    critDmg: actor.stats.critDmg,
    guarding: target.guarding,
    rng,
  });
  return { targetId: target.id, hpDelta: -damage, isCrit, isMiss: false, dealt: damage };
}

function resolveDamage(params: DamageParams, ctx: EffectContext): EffectResult {
  const target = ctx.targets[0];
  if (!target) return { targetResults: [], damageDealt: 0 };
  const mult =
    params.bonusVsStatus && target.statuses.some((s) => s.code === params.bonusVsStatus?.status)
      ? params.bonusVsStatus.mult
      : params.mult;
  const r = resolveSingleDamage(ctx.actor, target, mult, params.addCritRate ?? 0, ctx.rng);
  return { targetResults: [r], damageDealt: r.dealt };
}

function resolveDamageAoe(params: DamageAoeParams, ctx: EffectContext): EffectResult {
  const results = ctx.targets.map((t) => resolveSingleDamage(ctx.actor, t, params.mult, 0, ctx.rng));
  return {
    targetResults: results.map((r) => {
      const { dealt, ...rest } = r;
      void dealt;
      return rest;
    }),
    damageDealt: results.reduce((sum, r) => sum + r.dealt, 0),
  };
}

function resolveHeal(params: HealParams, ctx: EffectContext): EffectResult {
  const targetResults = ctx.targets.map((t) => ({
    targetId: t.id,
    hpDelta: Math.floor((t.maxHp * params.hpPctOfMax) / 100),
  }));
  return { targetResults, damageDealt: 0 };
}

function resolveBuff(params: BuffParams, ctx: EffectContext): EffectResult {
  const targetResults = ctx.targets.map((t) => ({
    targetId: t.id,
    hpDelta: 0,
    buffApplied: { code: params.buff, value: params.valuePct, remainingTurns: params.turns },
  }));
  return { targetResults, damageDealt: 0 };
}

/** 敵専用拡張キー chancePct を許容する（skillのdebuffはchancePct省略=必中） */
function resolveDebuff(
  params: DebuffParams & { chancePct?: number },
  ctx: EffectContext,
): EffectResult {
  const chancePct = params.chancePct;
  const targetResults = ctx.targets.map((t) => {
    const success = chancePct === undefined || ctx.rng.next() * 100 < chancePct;
    if (!success) return { targetId: t.id, hpDelta: 0 };
    return {
      targetId: t.id,
      hpDelta: 0,
      buffApplied: { code: params.debuff, value: params.valuePct, remainingTurns: params.turns },
    };
  });
  return { targetResults, damageDealt: 0 };
}

function resolveStatus(params: StatusParams, ctx: EffectContext): EffectResult {
  const targetResults = ctx.targets.map((t) => {
    const { statuses, applied } = applyStatusEffect(
      t.statuses,
      params.status,
      params.chancePct,
      t.stats.statusRes,
      ctx.rng,
    );
    // applyStatusEffectはCORE_SPEC既定の継続ターンで付与するため、params.turns指定時はここで上書きする
    const newStatuses =
      applied && params.turns !== undefined
        ? statuses.map((s) => (s.code === params.status ? { ...s, remainingTurns: params.turns as number } : s))
        : statuses;
    return {
      targetId: t.id,
      hpDelta: 0,
      statusApplied: { code: params.status, applied },
      newStatuses,
    };
  });
  return { targetResults, damageDealt: 0 };
}

/** applyStatusEffectは規定継続ターン固定のため、params.turns指定時はここで上書きする */
export function statusDurationFor(params: StatusParams): number {
  return params.turns ?? STATUS_DURATIONS[params.status];
}

function resolveSpGain(params: SpGainParams): EffectResult {
  return { targetResults: [], actorSpDelta: params.amount, damageDealt: 0 };
}

function resolveShield(params: ShieldParams): EffectResult {
  // shield用の永続スロットがrun_state側に未定義のため、Phase6ではdescriptorのみ返す
  return {
    targetResults: [],
    damageDealt: 0,
    note: `shield:${params.hpPctOfMax}pct:${params.turns ?? 'battle_end'}`,
  };
}

function resolveLifesteal(params: LifestealParams, ctx: EffectContext): EffectResult {
  const amount = Math.floor(((ctx.previousDamage ?? 0) * params.ratePct) / 100);
  return { targetResults: [], actorHpDelta: amount, damageDealt: 0 };
}

function resolveReviveGuard(params: ReviveGuardParams): EffectResult {
  // ラン1回限りの使用フラグを保持するスロットが未定義のため、Phase6ではdescriptorのみ返す
  return {
    targetResults: [],
    damageDealt: 0,
    note: `revive_guard:oncePerRun=${params.oncePerRun}:surviveHp=${params.surviveHp}`,
  };
}

function resolveCleanse(params: CleanseParams, ctx: EffectContext): EffectResult {
  const targetResults = ctx.targets.map((t) => ({
    targetId: t.id,
    hpDelta: 0,
    // 付与順の古いものからcount件解除（statuses配列は先頭が最古の想定）
    newStatuses: t.statuses.slice(params.count),
  }));
  return { targetResults, damageDealt: 0 };
}

function resolveStatPassive(params: StatPassiveParams): EffectResult {
  // 常時パッシブの実効値反映は呼び出し側（実効ステータス計算パイプライン）の責務。
  // Phase6ではparamsをnoteに記録し、適用有無のテストのみ担保する。
  return { targetResults: [], damageDealt: 0, note: `stat_passive:${JSON.stringify(params.stats)}` };
}

function resolveCounter(params: CounterParams): EffectResult {
  // 反応的な反撃トリガーの管理はcaller（executeEnemyAction等）側の責務。
  return {
    targetResults: [],
    damageDealt: 0,
    note: `counter:mult=${params.mult}:onlyWhenDefending=${params.onlyWhenDefending}`,
  };
}

/**
 * effect_typeに応じたハンドラへディスパッチする（Phase6が扱う13種）。
 * rawParamsはeffect-params.tsのeffectParamsSchemaで検証済みの値を想定するが、
 * 敵行動側の拡張キー（chancePct等）も許容するため型は緩めに受ける。
 */
export function resolveEffect(
  effectType: EffectType,
  rawParams: Record<string, unknown>,
  ctx: EffectContext,
): EffectResult {
  switch (effectType) {
    case 'damage':
      return resolveDamage(rawParams as unknown as DamageParams, ctx);
    case 'damage_aoe':
      return resolveDamageAoe(rawParams as unknown as DamageAoeParams, ctx);
    case 'heal':
      return resolveHeal(rawParams as unknown as HealParams, ctx);
    case 'buff':
      return resolveBuff(rawParams as unknown as BuffParams, ctx);
    case 'debuff':
      return resolveDebuff(rawParams as unknown as DebuffParams & { chancePct?: number }, ctx);
    case 'status':
      return resolveStatus(rawParams as unknown as StatusParams, ctx);
    case 'sp_gain':
      return resolveSpGain(rawParams as unknown as SpGainParams);
    case 'shield':
      return resolveShield(rawParams as unknown as ShieldParams);
    case 'lifesteal':
      return resolveLifesteal(rawParams as unknown as LifestealParams, ctx);
    case 'revive_guard':
      return resolveReviveGuard(rawParams as unknown as ReviveGuardParams);
    case 'cleanse':
      return resolveCleanse(rawParams as unknown as CleanseParams, ctx);
    case 'stat_passive':
      return resolveStatPassive(rawParams as unknown as StatPassiveParams);
    case 'counter':
      return resolveCounter(rawParams as unknown as CounterParams);
    default: {
      const exhaustive: never = effectType;
      throw new Error(`Unhandled effect_type: ${String(exhaustive)}`);
    }
  }
}
