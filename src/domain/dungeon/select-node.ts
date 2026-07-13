import { ENEMIES } from '@/constants/masters/enemies';
import { startBattle } from '@/domain/battle/start-battle';
import { createRng } from '@/domain/shared/rng';

import { findNode, type MapNode } from './map-types';
import type { RunState } from './run-state';

/**
 * 次ノード選択（docs/20 §2.3 selectNextNode）。純粋関数。
 *
 * Phase 6仕様（docs/27 Phase 6「戦闘システム」）:
 * - 戦闘系ノード（BATTLE/STRONG/ELITE/BOSS）: `startBattle` を呼びphase='battle'へ遷移する。
 *   勝敗はまだ決まっていないため、この時点ではcleared=falseかつearned加算も行わない
 *   （勝利判定・報酬付与はAPI-402側=execute-player-action/execute-enemy-action後のusecaseの責務）。
 *   難易度補正（difficultyStatMod）はMVPがNormal固定のため定数1.0を使用する（docs/27 Phase6指示）。
 *   乱数はDEC-019の再現性ルールに従い state.map.seed + state.rngCursor から復元し、
 *   消費後のカーソルをstate.rngCursorへ書き戻す。
 * - 非戦闘ノード（TREASURE/SHOP/REST/EVENT/BLESS/HEAL/CURSE/STORY/SECRET）: 引き続きPhase5のスタブ
 *   挙動のまま（通過のみ。result.stub=true）。Phase7で本実装に置き換える。
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
  /** ランクリア。Phase6時点ではBOSS撃破時のみusecase側（戦闘勝利時）でtrueにするため、
   *  本関数からは常にfalseを返す */
  cleared: boolean;
  /** Phase 5スタブ解決（非戦闘ノード）かどうか。戦闘ノードはfalse（本実装のためstub扱いではない） */
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

  const isBattleNode =
    node.type === 'BATTLE' || node.type === 'STRONG' || node.type === 'ELITE' || node.type === 'BOSS';

  if (isBattleNode) {
    const rng = createRng(state.map.seed, state.rngCursor);
    const battle = startBattle({
      nodeId: node.id,
      nodeType: node.type,
      floor: node.floor,
      character: state.character,
      difficultyStatMod: 1.0, // MVPはNormal固定（docs/27 Phase6指示）
      masters: { enemies: ENEMIES },
      rng,
    });

    const next: RunState = {
      ...state,
      position: { floor: node.floor, nodeId: node.id, phase: 'battle' },
      visited: [...state.visited, node.id],
      battle,
      rngCursor: rng.cursor,
    };

    return { state: next, node, cleared: false, stub: false };
  }

  const next: RunState = {
    ...state,
    position: { floor: node.floor, nodeId: node.id, phase: 'map_select' },
    visited: [...state.visited, node.id],
  };

  return { state: next, node, cleared: false, stub: true };
}
