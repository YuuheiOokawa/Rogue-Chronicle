import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { ENEMIES } from '@/constants/masters/enemies';
import { RANDOM_EVENTS } from '@/constants/masters/events';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { STORIES } from '@/constants/masters/stories';
import type { ConsumableCode } from '@/constants/items';
import type { EventChoiceDef } from '@/constants/masters/types';
import { startBattle } from '@/domain/battle/start-battle';
import { applyStatusEffect } from '@/domain/battle/status-effects';
import { generateShopItems } from '@/domain/reward/generate-shop';
import { generateTreasureReward } from '@/domain/reward/generate-treasure';
import { createRng, type Rng } from '@/domain/shared/rng';

import { findNode, type MapNode } from './map-types';
import type { PendingReward, RunState } from './run-state';

/**
 * 次ノード選択（docs/20 §2.3 selectNextNode）。純粋関数。
 *
 * Phase 7仕様（docs/27 Phase 7「報酬・スキル・装備」）:
 * - 戦闘系ノード（BATTLE/STRONG/ELITE/BOSS）: `startBattle` を呼びphase='battle'へ遷移する。
 *   勝敗はまだ決まっていないため、この時点ではcleared=falseかつearned加算も行わない
 *   （勝利判定・報酬付与はAPI-402側=execute-player-action/execute-enemy-action後のusecaseの責務）。
 *   難易度補正（difficultyStatMod）はMVPがNormal固定のため定数1.0を使用する。
 *   出現した敵のcodeはrun_state.encountered.enemiesへ重複なく蓄積する（図鑑差分用）。
 *   nextBattleDebuff==='weaken'の場合は戦闘開始時にプレイヤーへweakenを付与しフラグをクリアする
 *   （EV-05呪いの宝箱由来。docs/20コメント・run-state.tsコメント参照）。
 * - 非戦闘ノード（TREASURE/SHOP/REST/EVENT/BLESS/HEAL/CURSE/STORY/SECRET）: ノード進入と同時に
 *   即時解決してpendingRewardへ格納する（node_actionという独立phaseは導入しない。run-state.tsコメント）。
 *   HEAL/STORYは選択肢が無いため、この時点で効果を適用しautoResolvedへ結果を格納する。
 *   EVENT/BLESS/CURSEは選択肢のみ提示し、実際の確率抽選・効果適用はAPI-506（呼び出し側）が行う。
 */

export class InvalidNodeSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNodeSelectionError';
  }
}

export interface SelectNodeResult {
  state: RunState;
  node: MapNode;
  /** ランクリア。BOSS撃破時のみusecase側（戦闘勝利時）でtrueにするため、本関数からは常にfalseを返す */
  cleared: boolean;
  /** 非戦闘ノードの旧スタブ解決フラグ。Phase7で全ノードが本実装化したため常にfalse（互換のため残置） */
  stub: boolean;
}

/** 現在位置から選択可能なノードID一覧（未入場なら階層1の全ノード） */
export function selectableNodeIds(state: RunState): string[] {
  if (state.position.nodeId === null) {
    return state.map.floors[0].map((n) => n.id);
  }
  const current = findNode(state.map, state.position.nodeId);
  return current?.next ?? [];
}

// ---------------------------------------------------------------
// BLESS/CURSE固定選択肢（RANDOM_EVENTSマスタには無いためここでハードコードする。
// 実装指示: 「この3択定義はselect-node.ts内かAPI-506側にハードコードしてよい」）。
// EventChoiceDef/EventOutcome/EventEffect型をそのまま再利用することで、
// API-506側は resolveEventOutcome + applyEventEffects の既存domain関数をEVENT同様に呼べる。
// ---------------------------------------------------------------

export const BLESS_FIXED_EVENT_CODE = 'bless_fixed';
export const CURSE_FIXED_EVENT_CODE = 'curse_fixed';
export const HEAL_AUTO_EVENT_CODE = 'heal_auto';
export const STORY_AUTO_EVENT_CODE_FALLBACK = 'story_auto';

export const BLESS_CHOICES: readonly EventChoiceDef[] = [
  {
    order: 1,
    label: '攻撃の加護（攻撃力+8%）',
    outcomes: [
      {
        probability: 100,
        resultText: '攻撃の加護を受けた（攻撃力+8%）。',
        effects: [{ type: 'runStatModPct', stat: 'atk', valuePct: 8 }],
      },
    ],
  },
  {
    order: 2,
    label: '守備の加護（防御力+8%）',
    outcomes: [
      {
        probability: 100,
        resultText: '守備の加護を受けた（防御力+8%）。',
        effects: [{ type: 'runStatModPct', stat: 'def', valuePct: 8 }],
      },
    ],
  },
  {
    order: 3,
    label: '生命の加護（最大HP+10%）',
    outcomes: [
      {
        probability: 100,
        resultText: '生命の加護を受けた（最大HP+10%）。',
        effects: [{ type: 'runStatModPct', stat: 'maxHp', valuePct: 10 }],
      },
    ],
  },
];

export const CURSE_CHOICES: readonly EventChoiceDef[] = [
  {
    order: 1,
    label: '呪いを受け入れる（最大HP-10%と引き換えに強力な報酬）',
    outcomes: [
      {
        probability: 50,
        resultText: '呪いを受け入れ、見事な装備を手に入れた（最大HP-10%）。',
        effects: [
          { type: 'runStatModPct', stat: 'maxHp', valuePct: -10 },
          { type: 'grantEquipment', rarityWeights: { epic: 100 } },
        ],
      },
      {
        probability: 50,
        resultText: '呪いを受け入れ、遺物を手に入れた（最大HP-10%）。',
        effects: [
          { type: 'runStatModPct', stat: 'maxHp', valuePct: -10 },
          { type: 'grantRelic' },
        ],
      },
    ],
  },
  {
    order: 2,
    label: '立ち去る',
    outcomes: [{ probability: 100, resultText: '呪いには触れなかった。', effects: [] }],
  },
];

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

function addUniqueAll(list: readonly string[], codes: readonly string[]): string[] {
  return codes.reduce((acc, c) => addUnique(acc, c), [...list]);
}

function toChoiceLabels(choices: readonly EventChoiceDef[]): { index: number; label: string }[] {
  return [...choices]
    .sort((a, b) => a.order - b.order)
    .map((c, index) => ({ index, label: c.label }));
}

/** 消耗品付与（docs/20 §2.26 grantConsumable相当。所持上限超過は+overflowGold換算） */
function addConsumable(
  items: RunState['items'],
  gold: number,
  code: ConsumableCode,
  count: number,
): { items: RunState['items']; gold: number } {
  const meta = CONSUMABLES_BY_CODE[code];
  const existing = items.find((i) => i.code === code);
  const currentCount = existing?.count ?? 0;
  const addable = Math.max(0, Math.min(count, meta.maxHold - currentCount));
  const overflow = count - addable;
  let nextItems = items;
  if (addable > 0) {
    nextItems = existing
      ? items.map((i) => (i.code === code ? { ...i, count: i.count + addable } : i))
      : [...items, { code, count: addable }];
  }
  const nextGold = overflow > 0 ? gold + overflow * meta.overflowGold : gold;
  return { items: nextItems, gold: nextGold };
}

function isBattleNodeType(type: MapNode['type']): boolean {
  return type === 'BATTLE' || type === 'STRONG' || type === 'ELITE' || type === 'BOSS';
}

function finishWithPendingReward(
  state: RunState,
  node: MapNode,
  visited: string[],
  pendingReward: PendingReward,
  rng: Rng,
): SelectNodeResult {
  const next: RunState = {
    ...state,
    position: { floor: node.floor, nodeId: node.id, phase: 'reward_pending' },
    visited,
    pendingReward,
    rngCursor: rng.cursor,
  };
  return { state: next, node, cleared: false, stub: false };
}

export function selectNextNode(state: RunState, nodeId: string): SelectNodeResult {
  if (state.position.phase !== 'map_select') {
    throw new InvalidNodeSelectionError(`phase is ${state.position.phase}, not map_select`);
  }
  if (!selectableNodeIds(state).includes(nodeId)) {
    // 隣接ノード以外への移動は構造的に拒否（docs/22 不正進行防止）
    throw new InvalidNodeSelectionError(`node ${nodeId} is not adjacent`);
  }
  const node = findNode(state.map, nodeId);
  if (!node) throw new InvalidNodeSelectionError(`node ${nodeId} not found`);

  const rng = createRng(state.map.seed, state.rngCursor);
  const visited = [...state.visited, node.id];

  if (isBattleNodeType(node.type)) {
    const battle = startBattle({
      nodeId: node.id,
      nodeType: node.type,
      floor: node.floor,
      character: state.character,
      difficultyStatMod: 1.0, // MVPはNormal固定
      masters: { enemies: ENEMIES },
      rng,
    });

    let nextBattleDebuff = state.nextBattleDebuff;
    let player = battle.player;
    if (nextBattleDebuff === 'weaken') {
      // successRateBase=100・targetStatusRes=0で確定付与（呪い由来の確定デバフのため耐性を無視する）
      const result = applyStatusEffect(player.statuses, 'weaken', 100, 0, rng);
      player = { ...player, statuses: result.statuses };
      nextBattleDebuff = null;
    }

    const next: RunState = {
      ...state,
      position: { floor: node.floor, nodeId: node.id, phase: 'battle' },
      visited,
      battle: { ...battle, player },
      nextBattleDebuff,
      encountered: {
        ...state.encountered,
        enemies: addUniqueAll(
          state.encountered.enemies,
          battle.enemies.map((e) => e.code),
        ),
      },
      rngCursor: rng.cursor,
    };

    return { state: next, node, cleared: false, stub: false };
  }

  switch (node.type) {
    case 'TREASURE':
    case 'SECRET': {
      const tableCode = node.type === 'SECRET' ? 'rt_treasure_secret' : 'rt_treasure_normal';
      const reward = generateTreasureReward(
        tableCode,
        node.floor,
        state.relics,
        { rewardTables: REWARD_TABLES, equipment: EQUIPMENT, relics: RELICS },
        rng,
      );
      return finishWithPendingReward(state, node, visited, reward, rng);
    }
    case 'SHOP': {
      const slots = generateShopItems(
        node.floor,
        state.relics,
        { equipment: EQUIPMENT, relics: RELICS },
        rng,
      );
      return finishWithPendingReward(state, node, visited, { type: 'shop', slots }, rng);
    }
    case 'REST': {
      return finishWithPendingReward(state, node, visited, { type: 'rest' }, rng);
    }
    case 'EVENT': {
      const candidates = RANDOM_EVENTS.filter(
        (e) => node.floor >= e.minFloor && node.floor <= e.maxFloor,
      );
      if (candidates.length === 0) {
        throw new RangeError(`selectNextNode: no EVENT candidates for floor=${node.floor}`);
      }
      const event = rng.pick(candidates);
      return finishWithPendingReward(
        state,
        node,
        visited,
        { type: 'event', eventCode: event.code, nodeType: 'EVENT', choices: toChoiceLabels(event.choices) },
        rng,
      );
    }
    case 'BLESS': {
      return finishWithPendingReward(
        state,
        node,
        visited,
        {
          type: 'event',
          eventCode: BLESS_FIXED_EVENT_CODE,
          nodeType: 'BLESS',
          choices: toChoiceLabels(BLESS_CHOICES),
        },
        rng,
      );
    }
    case 'CURSE': {
      return finishWithPendingReward(
        state,
        node,
        visited,
        {
          type: 'event',
          eventCode: CURSE_FIXED_EVENT_CODE,
          nodeType: 'CURSE',
          choices: toChoiceLabels(CURSE_CHOICES),
        },
        rng,
      );
    }
    case 'HEAL': {
      const healAmount = Math.floor(state.character.stats.maxHp * 0.35);
      const hp = Math.min(state.character.stats.maxHp, state.character.hp + healAmount);
      let items = state.items;
      let gold = state.gold;
      let resultText = `泉の力が傷を癒やした（HP+${healAmount}）。`;
      if (rng.next() * 100 < 25) {
        const granted = addConsumable(items, gold, 'potion', 1);
        items = granted.items;
        gold = granted.gold;
        resultText += ' さらにポーションを1個見つけた。';
      }
      const next: RunState = {
        ...state,
        position: { floor: node.floor, nodeId: node.id, phase: 'reward_pending' },
        visited,
        character: { ...state.character, hp },
        items,
        gold,
        pendingReward: {
          type: 'event',
          eventCode: HEAL_AUTO_EVENT_CODE,
          nodeType: 'HEAL',
          choices: [],
          autoResolved: { resultText, claimed: false },
        },
        rngCursor: rng.cursor,
      };
      return { state: next, node, cleared: false, stub: false };
    }
    case 'STORY': {
      const candidates = STORIES.filter((s) => s.unlockCondition.type === 'storyNode');
      const story = candidates.length > 0 ? rng.pick(candidates) : null;
      const resultText = story ? `${story.title}\n${story.body}` : '静寂だけがあった。';
      const next: RunState = {
        ...state,
        position: { floor: node.floor, nodeId: node.id, phase: 'reward_pending' },
        visited,
        earned: { ...state.earned, soulShards: state.earned.soulShards + 5 },
        pendingReward: {
          type: 'event',
          eventCode: story?.code ?? STORY_AUTO_EVENT_CODE_FALLBACK,
          nodeType: 'STORY',
          choices: [],
          autoResolved: { resultText, claimed: false },
        },
        rngCursor: rng.cursor,
      };
      return { state: next, node, cleared: false, stub: false };
    }
    default: {
      // BATTLE/STRONG/ELITE/BOSSはisBattleNodeTypeで既に処理済みのため到達しない
      throw new InvalidNodeSelectionError(`unhandled node type: ${node.type as string}`);
    }
  }
}
