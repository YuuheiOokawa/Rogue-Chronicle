import { describe, expect, it } from 'vitest';

import { DUNGEONS } from '@/constants/masters/dungeons';

import { createRng } from '../shared/rng';
import { generateDungeonMap, validateMap } from './generate-map';
import { allNodes, bossNode } from './map-types';

const config = DUNGEONS[0].generationConfig;

describe('generateDungeonMap（docs/17 §3 / P5完了条件）', () => {
  it('同一seedで完全に同一のマップを生成する（再現性・DEC-019）', () => {
    for (const seed of [1, 42, 123456789, 0xffffffff]) {
      const a = generateDungeonMap(seed, config, createRng(seed));
      const b = generateDungeonMap(seed, config, createRng(seed));
      expect(a).toEqual(b);
    }
  });

  it('異なるseedでは異なるマップになる（縮退していない）', () => {
    const a = generateDungeonMap(1, config, createRng(1));
    const b = generateDungeonMap(2, config, createRng(2));
    expect(JSON.stringify(a.floors)).not.toBe(JSON.stringify(b.floors));
  });

  it('生成1,000回で制約違反0件（P5完了条件）', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      expect(validateMap(map, config), `seed=${seed}`).toBe(true);
    }
  });

  it('構造: 階層10・階層1と10は1ノード・中間は2〜4ノード', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      expect(map.floors).toHaveLength(10);
      expect(map.floors[0]).toHaveLength(1);
      expect(map.floors[0][0].type).toBe('BATTLE');
      expect(map.floors[9]).toHaveLength(1);
      expect(map.floors[9][0].type).toBe('BOSS');
      for (let f = 1; f < 9; f += 1) {
        expect(map.floors[f].length).toBeGreaterThanOrEqual(2);
        expect(map.floors[f].length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('全パスがボスへ到達可能・全ノードが開始から到達可能', () => {
    for (let seed = 500; seed <= 600; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      const boss = bossNode(map);
      // 開始からのBFS
      const reachable = new Set([map.floors[0][0].id]);
      for (const node of allNodes(map)) {
        if (reachable.has(node.id)) node.next.forEach((n) => reachable.add(n));
      }
      expect(reachable.has(boss.id)).toBe(true);
      expect(allNodes(map).every((n) => reachable.has(n.id))).toBe(true);
    }
  });

  it('階層5と9に必ずREST・SHOPは1〜2・ELITEは階層3以降', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      expect(map.floors[4].some((n) => n.type === 'REST'), `seed=${seed} floor5`).toBe(true);
      expect(map.floors[8].some((n) => n.type === 'REST'), `seed=${seed} floor9`).toBe(true);
      const shops = allNodes(map).filter((n) => n.type === 'SHOP').length;
      expect(shops).toBeGreaterThanOrEqual(1);
      expect(shops).toBeLessThanOrEqual(2);
      expect(allNodes(map).some((n) => n.type === 'ELITE' && n.floor < 3)).toBe(false);
      expect(allNodes(map).some((n) => n.type === 'CURSE' && n.floor < 3)).toBe(false);
    }
  });

  it('同一タイプがパス上で3連続しない', () => {
    for (let seed = 700; seed <= 900; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      const byId = new Map(allNodes(map).map((n) => [n.id, n]));
      for (const node of allNodes(map)) {
        for (const childId of node.next) {
          const child = byId.get(childId)!;
          if (child.type !== node.type) continue;
          for (const grandId of child.next) {
            const grand = byId.get(grandId)!;
            expect(
              grand.type === node.type,
              `seed=${seed}: ${node.id}(${node.type})→${child.id}→${grand.id}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('SECRETは出現しても1個・階層3〜8のみ（1,000シードの統計で出現率約10%）', () => {
    let secretRuns = 0;
    for (let seed = 1; seed <= 1000; seed += 1) {
      const map = generateDungeonMap(seed, config, createRng(seed));
      const secrets = allNodes(map).filter((n) => n.type === 'SECRET');
      expect(secrets.length).toBeLessThanOrEqual(1);
      if (secrets.length === 1) {
        secretRuns += 1;
        expect(secrets[0].floor).toBeGreaterThanOrEqual(3);
        expect(secrets[0].floor).toBeLessThanOrEqual(8);
      }
    }
    // 期待値10% ± 3%
    expect(secretRuns / 1000).toBeGreaterThan(0.07);
    expect(secretRuns / 1000).toBeLessThan(0.13);
  });
});
