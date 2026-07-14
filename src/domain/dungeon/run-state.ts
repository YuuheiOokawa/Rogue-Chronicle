import { z } from 'zod';

import type { CharacterMaster, EquipmentMaster } from '@/constants/masters/types';

import { battleStateSchema } from '../battle/types';
import { dungeonMapSchema, type DungeonMap } from './map-types';

/**
 * run_state（dungeon_runs.run_state JSONB）のスキーマと初期化（docs/15 / CORE_SPEC §8）。
 * - 読み書きは必ず validateRunState を通す（破損・改ざん検知 → ERR_RUN_STATE_INVALIDはserver層で変換）
 * - schemaVersion: 構造変更時にインクリメントし、旧版はマイグレーション関数で引き上げる
 * - Phase 6時点: phaseに'battle'を追加
 * - Phase 7: phaseに'reward_pending'を追加。pendingReward（discriminated union）/
 *   nextBattleDebuff / earned.eliteKills / encountered を追加（詳細は各フィールドの直上コメント）。
 *   docs/17 §10.1のphase遷移図は 'node_action' も定義しているが、本実装では
 *   非戦闘ノード（TREASURE/SHOP/REST/EVENT/BLESS/HEAL/CURSE/STORY/SECRET）はノード進入と同時に
 *   即時解決してpendingRewardへ格納するか、報酬不要ならmap_selectへ戻す設計とし、
 *   'node_action' という独立phaseは導入しない（実装判断。1phase減らせて状態遷移が単純になるため）。
 */

export const RUN_STATE_SCHEMA_VERSION = 1;

export const runPhaseSchema = z.enum(['map_select', 'battle', 'reward_pending']);
export type RunPhase = z.infer<typeof runPhaseSchema>;

// ---------------------------------------------------------------
// pendingReward（Phase7）: 未受領報酬。phase==='reward_pending'のときのみ非null
// （不変条件はvalidateRunStateで検証）。
// ---------------------------------------------------------------

/** レベルアップ時のスキル3択（docs/20 §2.21-2.22）。rarityはSkillMaster.rarityの文字列をそのまま保持 */
export const skillChoiceItemSchema = z.object({
  skillCode: z.string(),
  isUpgrade: z.boolean(),
  rarity: z.string(),
});
export type SkillChoiceItem = z.infer<typeof skillChoiceItemSchema>;

export const pendingRewardSkillChoiceSchema = z.object({
  type: z.literal('skill_choice'),
  choices: z.array(skillChoiceItemSchema).length(3),
  rerollRemaining: z.number().int().min(0),
  claimed: z.boolean(),
});

/** 宝箱（TREASURE/SECRET、docs/20 §2.23）。generateTreasureRewardの戻り値をそのまま埋め込む形 */
export const pendingRewardTreasureSchema = z.object({
  type: z.literal('treasure'),
  rewardType: z.enum(['equipment', 'gold', 'consumable', 'relic']),
  equipmentCode: z.string().optional(),
  goldAmount: z.number().int().optional(),
  consumableCode: z.string().optional(),
  relicCode: z.string().optional(),
  claimed: z.boolean(),
});

/** ショップ（SHOP、docs/20 §2.24-2.25）。claimedは持たず、離脱（leave操作）で手動終了する */
export const shopSlotSchema = z.object({
  slotIndex: z.number().int().min(0),
  kind: z.enum(['equipment', 'consumable', 'relic']),
  code: z.string(),
  price: z.number().int().min(0),
  soldOut: z.boolean(),
});
export type ShopSlot = z.infer<typeof shopSlotSchema>;

export const pendingRewardShopSchema = z.object({
  type: z.literal('shop'),
  slots: z.array(shopSlotSchema),
});

/** 休憩（REST）。マーカーのみ。実処理（HP回復 or スキル強化 or スキル削除）はAPI-505が担う */
export const pendingRewardRestSchema = z.object({
  type: z.literal('rest'),
});

/**
 * イベント（EVENT/BLESS/HEAL/CURSE/STORY、docs/20 §2.26）。
 * HEAL/STORYは選択肢なしで自動解決される想定のため、ノード進入時点で既に効果を適用済みにし、
 * autoResolvedにresultTextを入れて「確認して閉じる」だけのUIにする（choicesは空配列）。
 * EVENT/BLESS/CURSEは選択肢を提示し、選んだ時点（API-506）でサーバーがresolveEventOutcomeにより
 * 確率抽選する（事前に結果を確定させない）。
 */
export const pendingRewardEventSchema = z.object({
  type: z.literal('event'),
  eventCode: z.string(),
  nodeType: z.enum(['EVENT', 'BLESS', 'HEAL', 'CURSE', 'STORY']),
  choices: z.array(z.object({ index: z.number().int().min(0), label: z.string() })),
  autoResolved: z.object({ resultText: z.string(), claimed: z.boolean() }).optional(),
});

/**
 * 設計判断: 「単体レリック提示」専用の pendingReward.type='relic' は導入しない。
 * - 宝箱/SECRET経由のレリックは treasure.relicCode で完結する。
 * - イベント効果 grantRelic は選択の余地がなく即時付与のため、apply-effects側で
 *   run_state.relicsへ直接追加しoutcome.resultTextで結果を伝えるだけで十分（受領確認UIは不要）。
 * よって pendingReward の型は5種（skill_choice/treasure/shop/rest/event）のunionとする。
 */
export const pendingRewardSchema = z.discriminatedUnion('type', [
  pendingRewardSkillChoiceSchema,
  pendingRewardTreasureSchema,
  pendingRewardShopSchema,
  pendingRewardRestSchema,
  pendingRewardEventSchema,
]);
export type PendingReward = z.infer<typeof pendingRewardSchema>;
export type PendingRewardSkillChoice = z.infer<typeof pendingRewardSkillChoiceSchema>;
export type PendingRewardTreasure = z.infer<typeof pendingRewardTreasureSchema>;
export type PendingRewardShop = z.infer<typeof pendingRewardShopSchema>;
export type PendingRewardRest = z.infer<typeof pendingRewardRestSchema>;
export type PendingRewardEvent = z.infer<typeof pendingRewardEventSchema>;

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
  /** phase='battle'のときのみ非null（docs/20 §2.6 startBattle。Phase6で追加） */
  battle: battleStateSchema.nullable(),
  /** phase='reward_pending'のときのみ非null（Phase7で追加。不変条件はvalidateRunStateで検証） */
  pendingReward: pendingRewardSchema.nullable(),
  /**
   * 次回battle開始時に自動でweaken状態異常を1つ付与するためのフラグ（Phase7で追加、EV-05呪い用）。
   * 設計判断: apply-effects内で直接次バトルへ反映せず、フラグをrun_stateへ持たせ、
   * selectNextNode（startBattle呼び出し側）がこのフラグを見てbattle開始時にプレイヤーへ
   * weakenを付与し、消費後はnullへ戻す設計とする（apply-effects.tsのコード冒頭コメントに詳細）。
   */
  nextBattleDebuff: z.enum(['weaken']).nullable(),
  /**
   * イベント効果 startBattle(encounter='fixed', bonusGold) 由来の戦闘勝利ボーナスゴールド
   * （Phase7 EV-10「盗賊の待ち伏せ」等。apply-effects.ts の ApplyEventEffectsResult.battleBonusGold
   * コメント参照）。domain/battle/types.ts の BattleState へフィールド追加することはdomain/battle配下
   * 変更禁止のため、run_state側の一時フィールドとして次の戦闘決着まで保持する（実装判断）。
   * API-506（イベント選択）で戦闘が発生した際に設定し、API-402（戦闘行動）が戦闘終了時に
   * 勝利なら通常報酬へ加算、勝敗を問わず0へリセットする。
   */
  pendingBattleBonusGold: z.number().int().min(0),
  rngCursor: z.number().int().min(0),
  earned: z.object({
    soulShards: z.number().int().min(0),
    rankExp: z.number().int().min(0),
    kills: z.number().int().min(0),
    /** エリート撃破数（player_progress.eliteKills集計用。Phase7で追加） */
    eliteKills: z.number().int().min(0),
  }),
  /**
   * 図鑑差分抽出用の累積遭遇リスト（Phase7 grantPersistentRewards用に追加）。
   * skills/relics/equipmentは「現在所持」しか追わない（休憩でのスキル削除等で欠落するため）ので、
   * 一度でも入手・遭遇したコードを別途蓄積する。enemiesは戦闘関連（start-battle.ts/select-node.ts、
   * 本タスクでは変更禁止）が戦闘開始時に追記する想定。現時点（Phase7基盤）では空配列で初期化し、
   * skills/relics/equipmentへの追記は本タスクで実装するselect-skill.ts/apply-effects.ts/
   * generate-treasure.ts/purchase-shop-item.ts側の責務とする。
   */
  encountered: z.object({
    enemies: z.array(z.string()),
    skills: z.array(z.string()),
    relics: z.array(z.string()),
    equipment: z.array(z.string()),
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
  if (state.position.phase === 'battle' && state.battle === null) {
    throw new RangeError('phase is battle but battle is null');
  }
  if (state.position.phase !== 'battle' && state.battle !== null) {
    throw new RangeError('battle must be null unless phase is battle');
  }
  if (state.position.phase === 'reward_pending' && state.pendingReward === null) {
    throw new RangeError('phase is reward_pending but pendingReward is null');
  }
  if (state.position.phase !== 'reward_pending' && state.pendingReward !== null) {
    throw new RangeError('pendingReward must be null unless phase is reward_pending');
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
    battle: null,
    pendingReward: null,
    nextBattleDebuff: null,
    pendingBattleBonusGold: 0,
    rngCursor: params.rngCursor,
    earned: { soulShards: 0, rankExp: 0, kills: 0, eliteKills: 0 },
    // 初期装備も「このランで所持している装備」のためencountered.equipmentへ含める
    // （API-507装備変更の所持判定・図鑑差分の両方でrun開始時点から一貫させるための実装判断）。
    encountered: {
      enemies: [],
      skills: [],
      relics: [],
      equipment: [equipment.weapon, equipment.armor, equipment.accessory]
        .filter((e): e is EquipmentMaster => e !== null)
        .map((e) => e.code),
    },
    lastRequest: null,
  };
}
