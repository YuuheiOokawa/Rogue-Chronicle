// 戦闘ドメイン共有型定義（docs/20_Detailed_Design.md §2.0 を実装に落とし込む）
// Element/StatusCode/BuffCode/DebuffCodeは src/domain/skill/effect-params.ts のenum定義を
// 再エクスポートし完全一致させる（effect-params.tsは変更禁止のため、ここでは再利用のみ）。
import { z } from 'zod';

import { nodeTypeCodeSchema, type NodeTypeCode } from '@/constants/masters/types';
import {
  buffCodeSchema,
  debuffCodeSchema,
  elementSchema,
  statusCodeSchema,
  BUFF_CODES,
  DEBUFF_CODES,
  ELEMENTS,
  STATUS_CODES,
  type BuffCode,
  type DebuffCode,
  type Element,
  type StatusCode,
} from '@/domain/skill/effect-params';

export { BUFF_CODES, DEBUFF_CODES, ELEMENTS, STATUS_CODES, buffCodeSchema, debuffCodeSchema, elementSchema, statusCodeSchema };
export type { BuffCode, DebuffCode, Element, StatusCode };

/** バフ/デバフ双方を許容するコード（BuffInstance.code。CORE_SPEC §5.3の重複ルールは同種のみ適用） */
export const buffOrDebuffCodeSchema = z.union([buffCodeSchema, debuffCodeSchema]);
export type BuffOrDebuffCode = z.infer<typeof buffOrDebuffCodeSchema>;

// ---------------------------------------------------------------
// 戦闘ステータス（RunCharacter.statsと同形。CORE_SPEC §5.1）
// ---------------------------------------------------------------

export const combatStatsSchema = z.object({
  maxHp: z.number().int().min(1),
  atk: z.number().int().min(0),
  def: z.number().int().min(0),
  spd: z.number().int().min(0),
  critRate: z.number().min(0).max(100),
  critDmg: z.number().min(0),
  eva: z.number().min(0),
  acc: z.number().min(0),
  statusRes: z.number().min(0).max(100),
});
export type CombatStats = z.infer<typeof combatStatsSchema>;

export const statusInstanceSchema = z.object({
  code: statusCodeSchema,
  remainingTurns: z.number().int().min(0),
});
export type StatusInstance = z.infer<typeof statusInstanceSchema>;

export const buffInstanceSchema = z.object({
  code: buffOrDebuffCodeSchema,
  value: z.number(),
  remainingTurns: z.number().int().min(0),
});
export type BuffInstance = z.infer<typeof buffInstanceSchema>;

/**
 * アクター識別子。'player' | 'e0' | 'e1' | 'e2'（enemies配列のindexに対応）。
 * 型としては string に緩めているが、生成は playerActorId/enemyActorId ヘルパを使うこと。
 */
export type BattleActorRef = { side: 'player' } | { side: 'enemy'; enemyIndex: number };

export const PLAYER_ACTOR_ID = 'player';
export function playerActorId(): string {
  return PLAYER_ACTOR_ID;
}
export function enemyActorId(enemyIndex: number): string {
  return `e${enemyIndex}`;
}
export function actorRefToId(ref: BattleActorRef): string {
  return ref.side === 'player' ? playerActorId() : enemyActorId(ref.enemyIndex);
}
export function isPlayerActorId(id: string): boolean {
  return id === PLAYER_ACTOR_ID;
}
export function enemyIndexFromActorId(id: string): number | null {
  const m = /^e(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------
// intent（敵の行動予告）
// ---------------------------------------------------------------

export const enemyIntentSchema = z.object({
  actionCode: z.string(),
  label: z.string(),
  icon: z.string(),
});
export type EnemyIntent = z.infer<typeof enemyIntentSchema>;

// ---------------------------------------------------------------
// EnemyInstance（戦闘インスタンス。enemies.tsマスタ定義とは別枠）
// ---------------------------------------------------------------

export const enemyInstanceSchema = z.object({
  instanceId: z.string(),
  code: z.string(),
  name: z.string(),
  element: elementSchema,
  stats: combatStatsSchema,
  hp: z.number().int().min(0),
  statuses: z.array(statusInstanceSchema),
  buffs: z.array(buffInstanceSchema),
  guarding: z.boolean(),
  intent: enemyIntentSchema.nullable(),
  alive: z.boolean(),
  isSummon: z.boolean(),
  /** 直近の行動履歴。最新が先頭（同一行動3連続禁止判定用） */
  recentActionCodes: z.array(z.string()),
});
export type EnemyInstance = z.infer<typeof enemyInstanceSchema>;

// ---------------------------------------------------------------
// PlayerBattleState（実効ステータスはRunCharacter.stats+buffs/statusesから都度計算）
// ---------------------------------------------------------------

export const playerBattleStateSchema = z.object({
  hp: z.number().int().min(0),
  sp: z.number().int().min(0),
  statuses: z.array(statusInstanceSchema),
  buffs: z.array(buffInstanceSchema),
  guarding: z.boolean(),
});
export type PlayerBattleState = z.infer<typeof playerBattleStateSchema>;

// ---------------------------------------------------------------
// ActionLogEntry
// ---------------------------------------------------------------

export const actionLogActionSchema = z.enum([
  'attack',
  'skill',
  'guard',
  'item',
  'flee',
  'enemy_action',
  'status_tick',
]);
export type ActionLogAction = z.infer<typeof actionLogActionSchema>;

export const actionLogEntrySchema = z.object({
  turnNo: z.number().int().min(1),
  actorId: z.string(),
  action: actionLogActionSchema,
  detailCode: z.string().optional(),
  targetId: z.string().optional(),
  damage: z.number().optional(),
  isCrit: z.boolean().optional(),
  isMiss: z.boolean().optional(),
  healed: z.number().optional(),
  statusApplied: statusCodeSchema.optional(),
  buffApplied: z.string().optional(),
  hpAfter: z.record(z.string(), z.number()),
  note: z.string().optional(),
});
export type ActionLogEntry = z.infer<typeof actionLogEntrySchema>;

// ---------------------------------------------------------------
// BattleState
// ---------------------------------------------------------------

export const battleResultSchema = z.enum(['ongoing', 'win', 'lose', 'fled']);
export type BattleResult = z.infer<typeof battleResultSchema>;

export const battleStateSchema = z.object({
  nodeId: z.string(),
  nodeType: nodeTypeCodeSchema,
  turnNo: z.number().int().min(1),
  order: z.array(z.string()),
  player: playerBattleStateSchema,
  enemies: z.array(enemyInstanceSchema),
  log: z.array(actionLogEntrySchema),
  result: battleResultSchema,
  bossPhase: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  canFlee: z.boolean(),
});
export type BattleState = z.infer<typeof battleStateSchema>;

export type { NodeTypeCode };
