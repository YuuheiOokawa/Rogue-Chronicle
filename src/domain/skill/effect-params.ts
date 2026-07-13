// スキル効果 params 型定義 + Zodスキーマ（docs/18_Skill_Design.md §2.3 / §2.4 準拠）
// domain層: zod以外の外部依存禁止（Next/React/Prisma不可）
import { z } from 'zod';

// ---------------------------------------------------------------
// 基本enum（docs/18 §2.4）
// ---------------------------------------------------------------

export const ELEMENTS = ['none', 'fire', 'water', 'wind'] as const;
export type Element = (typeof ELEMENTS)[number];

export const STATUS_CODES = ['poison', 'burn', 'paralysis', 'stun', 'weaken'] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

export const BUFF_CODES = ['atkUp', 'defUp', 'spdUp', 'critUp', 'regen'] as const;
export type BuffCode = (typeof BUFF_CODES)[number];

export const DEBUFF_CODES = ['atkDown', 'defDown', 'spdDown'] as const;
export type DebuffCode = (typeof DEBUFF_CODES)[number];

export const MOD_STATS = [
  'atk',
  'def',
  'spd',
  'maxHp',
  'critRate',
  'critDmg',
  'eva',
  'acc',
  'statusRes',
  'spRegen', // 毎ターンSP回復量への加算
  'dmgDealtPct', // 与ダメ％補正
  'dmgTakenPct', // 被ダメ％補正
] as const;
export type ModStat = (typeof MOD_STATS)[number];

// effect_type enum（MVP 13種。docs/18 §2.3）
export const EFFECT_TYPES = [
  'damage',
  'damage_aoe',
  'heal',
  'buff',
  'debuff',
  'status',
  'sp_gain',
  'shield',
  'lifesteal',
  'revive_guard',
  'cleanse',
  'stat_passive',
  'counter',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

// ---------------------------------------------------------------
// params TypeScript型（docs/18 §2.4 を忠実に実装）
// ---------------------------------------------------------------

export interface PassiveCondition {
  turnEq?: number; // 戦闘のNターン目のみ有効
  hpBelow?: number; // 自HP割合がこの値未満のとき有効 (0.0-1.0)
  defending?: boolean; // 防御コマンド選択中のみ有効
}

export interface DamageParams {
  mult: number; // skillMult (0.8-3.0)
  addCritRate?: number; // この攻撃のみcritRateに加算(%)
  bonusVsStatus?: { status: StatusCode; mult: number }; // 対象が該当状態異常なら mult を差し替え
}
export interface DamageAoeParams {
  mult: number;
}
export interface HealParams {
  hpPctOfMax: number; // maxHpの%回復
}
export interface BuffParams {
  buff: BuffCode;
  valuePct: number;
  turns: number;
}
export interface DebuffParams {
  debuff: DebuffCode;
  valuePct: number;
  turns: number;
}
export interface StatusParams {
  status: StatusCode;
  chancePct: number;
  turns?: number; // 省略時はCORE_SPEC §5.3の既定値
}
export interface SpGainParams {
  amount: number;
}
export interface ShieldParams {
  hpPctOfMax: number;
  turns: number | null; // null=戦闘終了まで
}
export interface LifestealParams {
  ratePct: number; // 直前damage行の与ダメ×%回復
}
export interface ReviveGuardParams {
  oncePerRun: boolean;
  surviveHp: number;
}
export interface CleanseParams {
  count: number; // 解除数（付与順の古いものから）
}
export interface StatPassiveParams {
  stats: Partial<Record<ModStat, number>>;
  condition?: PassiveCondition;
}
export interface CounterParams {
  mult: number;
  onlyWhenDefending: boolean;
  chancePct: number;
}

export type EffectParams =
  | DamageParams
  | DamageAoeParams
  | HealParams
  | BuffParams
  | DebuffParams
  | StatusParams
  | SpGainParams
  | ShieldParams
  | LifestealParams
  | ReviveGuardParams
  | CleanseParams
  | StatPassiveParams
  | CounterParams;

// ---------------------------------------------------------------
// Zodスキーマ（JSONB読み書き時の検証。docs/12 §5.2 / docs/18 実装注意3）
// ---------------------------------------------------------------

export const elementSchema = z.enum(ELEMENTS);
export const statusCodeSchema = z.enum(STATUS_CODES);
export const buffCodeSchema = z.enum(BUFF_CODES);
export const debuffCodeSchema = z.enum(DEBUFF_CODES);
export const modStatSchema = z.enum(MOD_STATS);
export const effectTypeSchema = z.enum(EFFECT_TYPES);

export const passiveConditionSchema = z.object({
  turnEq: z.number().int().min(1).optional(),
  hpBelow: z.number().min(0).max(1).optional(),
  defending: z.boolean().optional(),
});

// skillMultはプレイヤースキルで0.8〜3.0（CORE_SPEC §5.4）。
// 敵行動は同一ハンドラ共用で0.5〜2.2の値を持つため（docs/19 §5〜6）、下限は緩めに取る。
const multSchema = z.number().min(0.1).max(3.0);
const pctSchema = z.number().min(0).max(100);

export const damageParamsSchema: z.ZodType<DamageParams> = z.object({
  mult: multSchema,
  addCritRate: z.number().min(0).max(100).optional(),
  bonusVsStatus: z.object({ status: statusCodeSchema, mult: multSchema }).optional(),
});

export const damageAoeParamsSchema: z.ZodType<DamageAoeParams> = z.object({
  mult: multSchema,
});

export const healParamsSchema: z.ZodType<HealParams> = z.object({
  hpPctOfMax: pctSchema,
});

export const buffParamsSchema: z.ZodType<BuffParams> = z.object({
  buff: buffCodeSchema,
  valuePct: z.number(),
  turns: z.number().int().min(1),
});

export const debuffParamsSchema: z.ZodType<DebuffParams> = z.object({
  debuff: debuffCodeSchema,
  valuePct: z.number(),
  turns: z.number().int().min(1),
});

export const statusParamsSchema: z.ZodType<StatusParams> = z.object({
  status: statusCodeSchema,
  chancePct: pctSchema,
  turns: z.number().int().min(1).optional(),
});

export const spGainParamsSchema: z.ZodType<SpGainParams> = z.object({
  amount: z.number().int().min(1),
});

export const shieldParamsSchema: z.ZodType<ShieldParams> = z.object({
  hpPctOfMax: pctSchema,
  turns: z.number().int().min(1).nullable(),
});

export const lifestealParamsSchema: z.ZodType<LifestealParams> = z.object({
  ratePct: pctSchema,
});

export const reviveGuardParamsSchema: z.ZodType<ReviveGuardParams> = z.object({
  oncePerRun: z.boolean(),
  surviveHp: z.number().int().min(1),
});

export const cleanseParamsSchema: z.ZodType<CleanseParams> = z.object({
  count: z.number().int().min(1),
});

export const statPassiveParamsSchema: z.ZodType<StatPassiveParams> = z.object({
  stats: z.partialRecord(modStatSchema, z.number()),
  condition: passiveConditionSchema.optional(),
});

export const counterParamsSchema: z.ZodType<CounterParams> = z.object({
  mult: multSchema,
  onlyWhenDefending: z.boolean(),
  chancePct: pctSchema,
});

const PARAMS_SCHEMA_BY_EFFECT_TYPE: Record<EffectType, z.ZodType<EffectParams>> = {
  damage: damageParamsSchema,
  damage_aoe: damageAoeParamsSchema,
  heal: healParamsSchema,
  buff: buffParamsSchema,
  debuff: debuffParamsSchema,
  status: statusParamsSchema,
  sp_gain: spGainParamsSchema,
  shield: shieldParamsSchema,
  lifesteal: lifestealParamsSchema,
  revive_guard: reviveGuardParamsSchema,
  cleanse: cleanseParamsSchema,
  stat_passive: statPassiveParamsSchema,
  counter: counterParamsSchema,
};

/**
 * effect_typeに対応するparamsのZodスキーマを返す。
 * 使用例: `effectParamsSchema('damage').parse(row.params)`
 * 未知のeffect_typeは例外（マスタ入力ミスをシード時に検出する。docs/18 実装注意3）
 */
export function effectParamsSchema(effectType: string): z.ZodType<EffectParams> {
  const schema = PARAMS_SCHEMA_BY_EFFECT_TYPE[effectType as EffectType];
  if (!schema) {
    throw new Error(`Unknown effect_type: ${effectType}`);
  }
  return schema;
}
