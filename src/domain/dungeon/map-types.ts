import { z } from 'zod';

import { nodeTypeCodeSchema, type NodeTypeCode } from '@/constants/masters/types';

/**
 * ノード選択型マップの構造（docs/17 §3 / CORE_SPEC §5.6）。
 * ノードIDは `f{階層}n{index}` 形式（例: f3n1）。
 */

export const mapNodeSchema = z.object({
  id: z.string().regex(/^f\d+n\d+$/),
  floor: z.number().int().min(1),
  type: nodeTypeCodeSchema,
  /** 次階層の接続先ノードID（ボスノードは空配列） */
  next: z.array(z.string()),
});
export type MapNode = z.infer<typeof mapNodeSchema>;

export const dungeonMapSchema = z.object({
  seed: z.number().int().min(1),
  /** floors[i] = 階層i+1 のノード列（左から右の表示順） */
  floors: z.array(z.array(mapNodeSchema)).min(1),
});
export type DungeonMap = z.infer<typeof dungeonMapSchema>;

export function findNode(map: DungeonMap, nodeId: string): MapNode | undefined {
  for (const floor of map.floors) {
    for (const node of floor) {
      if (node.id === nodeId) return node;
    }
  }
  return undefined;
}

export function allNodes(map: DungeonMap): MapNode[] {
  return map.floors.flat();
}

export function bossNode(map: DungeonMap): MapNode {
  const last = map.floors[map.floors.length - 1];
  return last[0];
}

export type { NodeTypeCode };
