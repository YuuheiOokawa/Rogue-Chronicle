import { z } from 'zod';

import type { CharacterMaster, EquipmentMaster } from '@/constants/masters/types';

import { dungeonMapSchema, type DungeonMap } from './map-types';

/**
 * run_state（dungeon_runs.run_state JSONB）のスキーマと初期化（docs/15 / CORE_SPEC §8）。
 * - 読み書きは必ず validateRunState を通す（破損・改ざん検知 → ERR_RUN_STATE_INVALIDはserver層で変換）
 * - schemaVersion: 構造変更時にインクリメントし、旧版はマイグレーション関数で引き上げる
 * - Phase 5時点: phaseは map_select のみ（battle / reward_pending は Phase 6/7 で追加）
 */

export const RUN_STATE_SCHEMA_VERSION = 1;

export const runPhaseSchema = z.enum(['map_select']); // P6: 'battle' / P7: 'node_action','reward_pending' を追加予定
export type RunPhase = z.infer<typeof runPhaseSchema>;

export const runCharacterSchema = z.object({
  code: z.string(),
  level: z.number().int().min(1).max(20),
  exp: z.number().int().min(0),
  stats: z.object({
    maxHp: z.number().int().min(1),
    atk: z.number().int().min(0),
    def: z.number().int().min(0),
    spd: z.number().int().min(0),
    critRate: z.number().min(0).max(100),
    critDmg: z.number().min(0),
    eva: z.number().min(0),
    acc: z.number().min(0),
    statusRes: z.number().min(0).max(100),
  }),
  hp: z.number().int().min(0),
  sp: z.number().int().min(0),
  maxSp: z.number().int().min(1),
});
export type RunCharacter = z.infer<typeof runCharacterSchema>;

export const lastRequestSchema = z.object({
  key: z.string(),
  apiId: z.string(),
  requestHash: z.string(),
  status: z.literal('completed'),
  responseBody: z.unknown(),
  savedAt: z.string(),
});
export type LastRequest = z.infer<typeof lastRequestSchema>;

export const runStateSchema = z.object({
  schemaVersion: z.literal(RUN_STATE_SCHEMA_VERSION),
  map: dungeonMapSchema,
  position: z.object({
    /** 0 = 未入場（次の選択対象は階層1）。以降は現在ノードの階層 */
    floor: z.number().int().min(0),
    nodeId: z.string().nullable(),
    phase: runPhaseSchema,
  }),
  /** 訪問済みノードID（Phase 5では訪問=クリア扱いのスタブ） */
  visited: z.array(z.string()),
  character: runCharacterSchema,
  skills: z.array(z.object({ code: z.string(), level: z.number().int().min(1).max(3) })).max(8),
  equipment: z.object({
    weapon: z.string().nullable(),
    armor: z.string().nullable(),
    accessory: z.string().nullable(),
  }),
  relics: z.array(z.string()),
  items: z.array(z.object({ code: z.string(), count: z.number().int().min(0).max(5) })),
  gold: z.number().int().min(0),
  rngCursor: z.number().int().min(0),
  earned: z.object({
    soulShards: z.number().int().min(0),
    rankExp: z.number().int().min(0),
    kills: z.number().int().min(0),
  }),
  lastRequest: lastRequestSchema.nullable(),
});
export type RunState = z.infer<typeof runStateSchema>;

/**
 * run_stateの検証（docs/20 §2.32 validateRunState）。
 * Zod構造検証 + 不変条件。失敗は例外（server層でERR_RUN_STATE_INVALIDへ変換）。
 */
export function validateRunState(raw: unknown): RunState {
  const state = runStateSchema.parse(raw);
  // 不変条件
  if (state.character.hp > state.character.stats.maxHp) {
    throw new RangeError('hp exceeds maxHp');
  }
  if (state.character.sp > state.character.maxSp) {
    throw new RangeError('sp exceeds maxSp');
  }
  if (state.position.nodeId !== null) {
    const exists = state.map.floors.flat().some((n) => n.id === state.position.nodeId);
    if (!exists) throw new RangeError('position.nodeId not in map');
  }
  const ids = new Set(state.map.floors.flat().map((n) => n.id));
  if (state.visited.some((v) => !ids.has(v))) throw new RangeError('visited contains unknown node');
  if (new Set(state.relics).size !== state.relics.length) {
    throw new RangeError('duplicate relics');
  }
  return state;
}

interface InitialRunStateParams {
  map: DungeonMap;
  character: CharacterMaster;
  /** スロット別の初期装備（未選択はnull）。所持検証はusecase側で実施済みであること */
  equipment: { weapon: EquipmentMaster | null; armor: EquipmentMaster | null; accessory: EquipmentMaster | null };
  rngCursor: number;
}

/** 初期SP（CORE_SPEC §5.1: 初期最大10） */
const INITIAL_MAX_SP = 10;
/** 初期所持アイテム（docs/05: ポーション1個） */
const INITIAL_ITEMS = [{ code: 'potion', count: 1 }];

/**
 * ラン開始時のrun_state構築（docs/20 §2.4 startDungeonRunのdomain部分）。
 * ステータス = キャラ基礎値 + 装備加算（得意武器一致は装備値+10%、docs/18）。
 * 永続強化（upgrade_nodes）の適用は Phase 8 で追加する（仮決定: P5では未適用）。
 */
export function createInitialRunState(params: InitialRunStateParams): RunState {
  const { character, equipment, map } = params;
  const stats = {
    maxHp: character.baseStats.maxHp,
    atk: character.baseStats.atk,
    def: character.baseStats.def,
    spd: character.baseStats.spd,
    critRate: character.baseStats.critRate,
    critDmg: character.baseStats.critDmg,
    eva: character.baseStats.eva,
    acc: character.baseStats.acc,
    statusRes: character.baseStats.statusRes,
  };

  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const equip = equipment[slot];
    if (!equip) continue;
    const favored =
      slot === 'weapon' && equip.weaponType != null && equip.weaponType === character.favoredWeaponType;
    const mod = favored ? 1.1 : 1.0; // 得意武器: 装備性能+10%（docs/18）
    for (const [key, value] of Object.entries(equip.baseStats)) {
      if (typeof value !== 'number') continue;
      if (key in stats) {
        const k = key as keyof typeof stats;
        stats[k] = Math.floor(stats[k] + value * mod);
      }
    }
  }

  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    map,
    position: { floor: 0, nodeId: null, phase: 'map_select' },
    visited: [],
    character: {
      code: character.code,
      level: 1,
      exp: 0,
      stats,
      hp: stats.maxHp,
      sp: INITIAL_MAX_SP,
      maxSp: INITIAL_MAX_SP,
    },
    skills: [
      ...character.initialSkillCodes.map((code) => ({ code, level: 1 })),
      { code: character.innateSkillCode, level: 1 },
    ],
    equipment: {
      weapon: equipment.weapon?.code ?? null,
      armor: equipment.armor?.code ?? null,
      accessory: equipment.accessory?.code ?? null,
    },
    relics: [],
    items: [...INITIAL_ITEMS],
    gold: 0,
    rngCursor: params.rngCursor,
    earned: { soulShards: 0, rankExp: 0, kills: 0 },
    lastRequest: null,
  };
}
