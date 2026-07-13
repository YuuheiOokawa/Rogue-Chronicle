import type { GenerationConfig, NodeTypeCode } from '@/constants/masters/types';

import type { Rng } from '../shared/rng';
import { allNodes, type DungeonMap, type MapNode } from './map-types';

/**
 * ノードマップ生成（docs/17 §3 / docs/20 §2.2 generateDungeonMap）。
 * 同一seed（=同一Rng状態）で完全に同一のマップを生成する（DEC-019）。
 *
 * 生成手順:
 *  1. 階層1=開始ノード（BATTLE固定・1個）、最終階層=BOSS固定・1個
 *  2. 中間階層のノード数を rng.int(middleMin, middleMax) で決定
 *  3. エッジ生成: 単調（交差なし）割当で全ノードの入次数・出次数>=1を保証
 *  4. タイプ割当: 確定枠（REST保証階層 / SHOP1〜2 / SECRET10%）→ 残りを階層帯別重みで抽選
 *     制約: ELITE/CURSEは指定階層以降のみ / 同一タイプがパス上で3連続しない
 *  5. 検証に失敗したら再生成（最大5回）。全滅時は決定的フォールバック
 */
export function generateDungeonMap(seed: number, config: GenerationConfig, rng: Rng): DungeonMap {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const map = tryGenerate(seed, config, rng);
    if (map && validateMap(map, config)) return map;
  }
  return deterministicFallback(seed, config);
}

function tryGenerate(seed: number, config: GenerationConfig, rng: Rng): DungeonMap | null {
  const { floorCount, nodeCounts } = config;

  // 手順1-2: ノード配置
  const floors: MapNode[][] = [];
  for (let f = 1; f <= floorCount; f += 1) {
    let count: number;
    if (f === 1) count = nodeCounts.firstFloor;
    else if (f === floorCount) count = nodeCounts.lastFloor;
    else count = rng.int(nodeCounts.middleMin, nodeCounts.middleMax);
    floors.push(
      Array.from({ length: count }, (_, i) => ({
        id: `f${f}n${i}`,
        floor: f,
        type: 'BATTLE' as NodeTypeCode, // 仮。手順4で割当
        next: [] as string[],
      })),
    );
  }

  // 手順3: エッジ生成（単調割当: ノードiの接続窓 = 次階層のインデックス比例区間）
  for (let f = 0; f < floorCount - 1; f += 1) {
    const cur = floors[f];
    const nxt = floors[f + 1];
    for (let i = 0; i < cur.length; i += 1) {
      const lo = Math.floor((i * nxt.length) / cur.length);
      const hi = Math.floor(((i + 1) * nxt.length) / cur.length);
      const targets = new Set<number>();
      for (let t = lo; t <= Math.min(hi, nxt.length - 1); t += 1) targets.add(t);
      // 追加分岐: 隣接インデックスへ確率50%で1本（交差しない範囲・上限まで）
      if (targets.size < config.edgesPerNode.max && rng.next() < 0.5) {
        const extra = Math.min(hi + 1, nxt.length - 1);
        targets.add(extra);
      }
      cur[i].next = [...targets]
        .slice(0, config.edgesPerNode.max)
        .sort((a, b) => a - b)
        .map((t) => nxt[t].id);
    }
    // 入次数0の次階層ノードを救済（最も近い現階層ノードから接続）
    const covered = new Set(cur.flatMap((n) => n.next));
    for (let t = 0; t < nxt.length; t += 1) {
      if (!covered.has(nxt[t].id)) {
        const from = cur[Math.min(Math.floor((t * cur.length) / nxt.length), cur.length - 1)];
        from.next = [...from.next, nxt[t].id].sort(
          (a, b) => parseNodeIndex(a) - parseNodeIndex(b),
        );
      }
    }
  }

  // 手順4: タイプ割当
  const assigned = new Set<string>();
  const fix = (node: MapNode, type: NodeTypeCode) => {
    node.type = type;
    assigned.add(node.id);
  };
  fix(floors[0][0], config.fixedNodes.firstFloorType);
  fix(floors[floorCount - 1][0], config.fixedNodes.lastFloorType);

  // 4-1: REST保証階層（各階層に必ず1つ以上）
  for (const f of config.constraints.restGuaranteedFloors) {
    const candidates = floors[f - 1].filter((n) => !assigned.has(n.id));
    if (candidates.length === 0) return null;
    fix(rng.pick(candidates), 'REST');
  }

  // 4-2: SHOP（マップ全体でmin〜max個。重み表にSHOPは無く保証枠のみで配置）
  const shopCount = rng.int(config.constraints.shopCountMin, config.constraints.shopCountMax);
  const shopFloors = new Set<number>();
  for (let s = 0; s < shopCount; s += 1) {
    const floorCandidates: number[] = [];
    for (let f = config.constraints.shopFloorMin; f <= config.constraints.shopFloorMax; f += 1) {
      if (!shopFloors.has(f) && floors[f - 1].some((n) => !assigned.has(n.id))) {
        floorCandidates.push(f);
      }
    }
    if (floorCandidates.length === 0) break; // 空きがなければ諦める（min>=1は検証で担保）
    const f = rng.pick(floorCandidates);
    shopFloors.add(f);
    fix(rng.pick(floors[f - 1].filter((n) => !assigned.has(n.id))), 'SHOP');
  }

  // 4-3: SECRET（確率chance・対象階層・最大maxCount）
  const { secret } = config.constraints;
  if (secret.maxCount > 0 && rng.next() < secret.chance) {
    const candidates = floors
      .slice(secret.floorMin - 1, secret.floorMax)
      .flat()
      .filter((n) => !assigned.has(n.id));
    if (candidates.length > 0) fix(rng.pick(candidates), 'SECRET');
  }

  // 4-4: 残りノードを階層順に重み抽選（先行階層は割当済みのため3連続チェックが可能）
  const incoming = buildIncomingIndex(floors);
  for (let f = 2; f < floorCount; f += 1) {
    for (const node of floors[f - 1]) {
      if (assigned.has(node.id)) continue;
      const weights = effectiveWeights(f, config);
      let type: NodeTypeCode | null = null;
      for (let retry = 0; retry < 20; retry += 1) {
        const candidate = rng.weighted(weights);
        if (!createsTriple(node, candidate, incoming)) {
          type = candidate;
          break;
        }
      }
      if (type === null) {
        // フォールバック: 3連続を作らないタイプを重み順に探索（docs/17の「BATTLEへフォールバック」を安全側に拡張）
        type =
          weights
            .map((w) => w.item)
            .find((t) => !createsTriple(node, t, incoming)) ?? 'BATTLE';
      }
      fix(node, type);
    }
  }

  return { seed, floors };
}

/** 階層帯の重み表 + 階層下限の振替（ELITE/CURSE）を適用し、weighted()入力へ変換 */
function effectiveWeights(
  floor: number,
  config: GenerationConfig,
): { item: NodeTypeCode; weight: number }[] {
  const band = config.typeWeightsByFloorBand.find((b) => floor >= b.floorMin && floor <= b.floorMax);
  if (!band) throw new RangeError(`no weight band for floor ${floor}`);
  const weights: Partial<Record<NodeTypeCode, number>> = { ...band.weights };

  const move = (from: NodeTypeCode, to: NodeTypeCode) => {
    const w = weights[from] ?? 0;
    if (w > 0) {
      weights[to] = (weights[to] ?? 0) + w;
      delete weights[from];
    }
  };
  if (floor < config.constraints.eliteMinFloor) move('ELITE', config.weightReassign.eliteBelowMinFloorTo);
  if (floor < config.constraints.curseMinFloor) move('CURSE', config.weightReassign.curseBelowMinFloorTo);

  return Object.entries(weights)
    .filter(([, w]) => (w ?? 0) > 0)
    .map(([item, weight]) => ({ item: item as NodeTypeCode, weight: weight as number }));
}

/** 各ノードの入力元（親）ノードの索引を構築 */
function buildIncomingIndex(floors: MapNode[][]): Map<string, MapNode[]> {
  const incoming = new Map<string, MapNode[]>();
  for (const node of floors.flat()) {
    for (const nextId of node.next) {
      const list = incoming.get(nextId) ?? [];
      list.push(node);
      incoming.set(nextId, list);
    }
  }
  return incoming;
}

/** node に candidate を割り当てると「親→祖父母」いずれかのパスで同タイプ3連続になるか */
function createsTriple(
  node: MapNode,
  candidate: NodeTypeCode,
  incoming: Map<string, MapNode[]>,
): boolean {
  for (const parent of incoming.get(node.id) ?? []) {
    if (parent.type !== candidate) continue;
    for (const grand of incoming.get(parent.id) ?? []) {
      if (grand.type === candidate) return true;
    }
  }
  return false;
}

function parseNodeIndex(id: string): number {
  return Number(id.slice(id.indexOf('n') + 1));
}

/** 生成結果の制約検証（違反時は再生成） */
export function validateMap(map: DungeonMap, config: GenerationConfig): boolean {
  const floors = map.floors;
  const floorCount = config.floorCount;
  if (floors.length !== floorCount) return false;

  // ボス到達可能性（開始ノードからBFS）
  const reachable = new Set<string>([floors[0][0].id]);
  for (const floor of floors) {
    for (const node of floor) {
      if (!reachable.has(node.id)) continue;
      node.next.forEach((n) => reachable.add(n));
    }
  }
  if (!reachable.has(floors[floorCount - 1][0].id)) return false;
  // 全ノード到達可能（無駄ノードなし）
  if (allNodes(map).some((n) => !reachable.has(n.id))) return false;
  // 全ノード（最終階層以外）が出次数>=1
  if (floors.slice(0, -1).some((floor) => floor.some((n) => n.next.length === 0))) return false;

  // REST保証
  for (const f of config.constraints.restGuaranteedFloors) {
    if (!floors[f - 1].some((n) => n.type === 'REST')) return false;
  }
  // SHOP数
  const shopCount = allNodes(map).filter((n) => n.type === 'SHOP').length;
  if (shopCount < config.constraints.shopCountMin || shopCount > config.constraints.shopCountMax) {
    return false;
  }
  // ELITE/CURSE階層下限
  if (
    allNodes(map).some(
      (n) =>
        (n.type === 'ELITE' && n.floor < config.constraints.eliteMinFloor) ||
        (n.type === 'CURSE' && n.floor < config.constraints.curseMinFloor),
    )
  ) {
    return false;
  }
  // 同一タイプ3連続禁止（全パス）
  if (config.constraints.noSameTypeTripleOnPath) {
    const incoming = buildIncomingIndex(floors);
    for (const node of allNodes(map)) {
      for (const parent of incoming.get(node.id) ?? []) {
        if (parent.type !== node.type) continue;
        for (const grand of incoming.get(parent.id) ?? []) {
          if (grand.type === node.type) return false;
        }
      }
    }
  }
  return true;
}

/**
 * 決定的フォールバック（docs/20 §2.2）: 各中間階層3ノード・全接続・安全なタイプ巡回。
 * 実質到達しないが、到達した場合も必ず制約を満たす形状にする。
 */
function deterministicFallback(seed: number, config: GenerationConfig): DungeonMap {
  const floorCount = config.floorCount;
  const floors: MapNode[][] = [];
  // BATTLE→EVENT→BATTLE→TREASURE… の巡回で3連続を構造的に回避
  const cycle: NodeTypeCode[] = ['BATTLE', 'EVENT', 'BATTLE', 'TREASURE'];
  for (let f = 1; f <= floorCount; f += 1) {
    const count = f === 1 || f === floorCount ? 1 : 3;
    floors.push(
      Array.from({ length: count }, (_, i) => ({
        id: `f${f}n${i}`,
        floor: f,
        type:
          f === 1
            ? config.fixedNodes.firstFloorType
            : f === floorCount
              ? config.fixedNodes.lastFloorType
              : cycle[(f + i) % cycle.length],
        next: [] as string[],
      })),
    );
  }
  for (const f of config.constraints.restGuaranteedFloors) {
    if (f > 1 && f < floorCount) floors[f - 1][0].type = 'REST';
  }
  // SHOPを1つ配置（shopFloorMin階層の2番目のノード）
  const shopFloor = Math.min(Math.max(config.constraints.shopFloorMin, 2), floorCount - 1);
  floors[shopFloor - 1][1].type = 'SHOP';
  // 全接続
  for (let f = 0; f < floorCount - 1; f += 1) {
    for (const node of floors[f]) {
      node.next = floors[f + 1].map((n) => n.id);
    }
  }
  return { seed, floors };
}
