import { findNode, type MapNode } from './map-types';
import type { RunState } from './run-state';

/**
 * 次ノード選択（docs/20 §2.3 selectNextNode）。純粋関数。
 *
 * Phase 5時点のスタブ仕様（docs/27 Phase 5「非戦闘ノードは通過のみ・戦闘はスタブ勝利」）:
 * - 全ノードタイプで入場=即解決とし、phaseは 'map_select' のまま位置と獲得値のみ進める
 * - 戦闘系（BATTLE/STRONG/ELITE）: スタブ勝利（kills+1, rankExp+10）
 * - BOSS: スタブ勝利 + ランクリア（result.cleared=true。status遷移はusecase側）
 * - その他: 通過（result.stub=true）
 * Phase 6/7 で戦闘・報酬の本実装に置き換える。
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
  /** ランクリア（BOSS撃破スタブ）。usecaseがstatus='cleared'へ遷移させる */
  cleared: boolean;
  /** Phase 5のスタブ解決であることの明示（クライアント表示用） */
  stub: true;
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

  const isBattle = node.type === 'BATTLE' || node.type === 'STRONG' || node.type === 'ELITE';
  const isBoss = node.type === 'BOSS';

  const next: RunState = {
    ...state,
    position: { floor: node.floor, nodeId: node.id, phase: 'map_select' },
    visited: [...state.visited, node.id],
    earned: {
      ...state.earned,
      // スタブ報酬（Phase 6で計算式ベースに置換）: 到達階層×10はラン終了時に別途計上
      kills: state.earned.kills + (isBattle || isBoss ? 1 : 0),
      rankExp: state.earned.rankExp + (isBattle ? 10 : isBoss ? 100 : 0),
    },
  };

  return { state: next, node, cleared: isBoss, stub: true };
}
