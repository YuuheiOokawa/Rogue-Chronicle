import type { PendingReward, RunState } from '@/domain/dungeon/run-state';
import { selectableNodeIds } from '@/domain/dungeon/select-node';

/**
 * pendingRewardのクライアント公開用投影（docs/13 実装時の注意点:
 * 「未開封のpendingReward内容を絶対に含めない」）。
 * - treasure: 開封（API-503）前は中身（rewardType/code/goldAmount）を一切見せない。
 *   claimedになった時点でrun_state.pendingRewardはnullへ遷移する設計のため、
 *   ここで公開してよいのは「宝箱が存在すること」のみ。
 * - skill_choice/shop/rest/event: 選択に必要な情報（候補・品揃え・選択肢ラベル）は
 *   そのまま公開する（それ自体が画面の表示内容のため）。event.choicesはラベルのみで
 *   outcomes（確率・効果）を含まない型のため、この時点でも安全。
 */
export type PendingRewardView =
  | {
      type: 'skill_choice';
      choices: Extract<PendingReward, { type: 'skill_choice' }>['choices'];
      rerollRemaining: number;
    }
  | { type: 'treasure'; claimed: false }
  | { type: 'shop'; slots: Extract<PendingReward, { type: 'shop' }>['slots'] }
  | { type: 'rest' }
  | {
      type: 'event';
      eventCode: string;
      nodeType: Extract<PendingReward, { type: 'event' }>['nodeType'];
      choices: Extract<PendingReward, { type: 'event' }>['choices'];
      autoResolved?: Extract<PendingReward, { type: 'event' }>['autoResolved'];
    };

export function toPendingRewardView(pendingReward: RunState['pendingReward']): PendingRewardView | null {
  if (pendingReward === null) return null;
  switch (pendingReward.type) {
    case 'skill_choice':
      return {
        type: 'skill_choice',
        choices: pendingReward.choices,
        rerollRemaining: pendingReward.rerollRemaining,
      };
    case 'treasure':
      return { type: 'treasure', claimed: false };
    case 'shop':
      return { type: 'shop', slots: pendingReward.slots };
    case 'rest':
      return { type: 'rest' };
    case 'event':
      return {
        type: 'event',
        eventCode: pendingReward.eventCode,
        nodeType: pendingReward.nodeType,
        choices: pendingReward.choices,
        autoResolved: pendingReward.autoResolved,
      };
  }
}

/**
 * run_stateのクライアント表示用View（docs/13 実装時の注意点）。
 * seed / rngCursor / lastRequest 等の内部情報は**絶対に含めない**（情報チート防止）。
 */
export interface RunView {
  runId: string;
  dungeonCode: string;
  difficulty: string;
  status: string;
  version: number;
  map: RunState['map']['floors'];
  position: RunState['position'];
  visited: string[];
  selectable: string[];
  character: RunState['character'];
  skills: RunState['skills'];
  equipment: RunState['equipment'];
  relics: string[];
  items: RunState['items'];
  gold: number;
  earned: RunState['earned'];
  pendingReward: PendingRewardView | null;
  /** このランで一度でも入手した装備コード（API-507の再装着可否判定・SCR-312所持品確認に使用） */
  encounteredEquipment: string[];
}

export function toRunView(
  run: { id: string; dungeonCode: string; difficulty: string; status: string; version: number },
  state: RunState,
): RunView {
  return {
    runId: run.id,
    dungeonCode: run.dungeonCode,
    difficulty: run.difficulty,
    status: run.status,
    version: run.version,
    map: state.map.floors, // seedは含めない
    position: state.position,
    visited: state.visited,
    selectable: run.status === 'active' ? selectableNodeIds(state) : [],
    character: state.character,
    skills: state.skills,
    equipment: state.equipment,
    relics: state.relics,
    items: state.items,
    gold: state.gold,
    earned: state.earned,
    pendingReward: toPendingRewardView(state.pendingReward),
    encounteredEquipment: state.encountered.equipment,
  };
}
