import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';

import { createRng } from '../shared/rng';
import { generateDungeonMap } from './generate-map';
import { bossNode, findNode } from './map-types';
import { createInitialRunState, type RunState } from './run-state';
import { InvalidNodeSelectionError, selectableNodeIds, selectNextNode } from './select-node';

const config = DUNGEONS[0].generationConfig;
const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;

function makeState(seed = 7): RunState {
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, config, rng);
  return createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: null, armor: null, accessory: null },
    rngCursor: rng.cursor,
  });
}

describe('selectNextNode（docs/20 §2.3・P5スタブ）', () => {
  it('未入場時は階層1のノードのみ選択可能', () => {
    const state = makeState();
    expect(selectableNodeIds(state)).toEqual(['f1n0']);
  });

  it('隣接ノード以外の選択を拒否する（不正進行防止）', () => {
    const state = makeState();
    expect(() => selectNextNode(state, 'f5n0')).toThrow(InvalidNodeSelectionError);
    expect(() => selectNextNode(state, 'nonexistent')).toThrow(InvalidNodeSelectionError);
  });

  it('選択で位置・訪問・獲得値が進む（戦闘ノードはスタブ勝利）', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0'); // 階層1はBATTLE固定
    expect(r1.state.position).toMatchObject({ floor: 1, nodeId: 'f1n0', phase: 'map_select' });
    expect(r1.state.visited).toContain('f1n0');
    expect(r1.state.earned.kills).toBe(1);
    expect(r1.cleared).toBe(false);
    expect(r1.stub).toBe(true);
    // 元のstateは不変（イミュータブル）
    expect(state.visited).toHaveLength(0);
  });

  it('隣接をたどってボスまで到達でき、BOSSでcleared=trueになる', () => {
    let state = makeState();
    const boss = bossNode(state.map);
    let guard = 0;
    let cleared = false;
    while (guard++ < 20) {
      const candidates = selectableNodeIds(state);
      expect(candidates.length).toBeGreaterThan(0);
      // ボスへ近づくため常に先頭を選ぶ（列グラフなので必ず前進する）
      const result = selectNextNode(state, candidates[0]);
      state = result.state;
      if (result.cleared) {
        cleared = true;
        expect(result.node.id).toBe(boss.id);
        break;
      }
    }
    expect(cleared).toBe(true);
    expect(state.visited).toHaveLength(10); // 階層1〜10で10ノード
    expect(state.earned.rankExp).toBeGreaterThanOrEqual(100); // ボス分
  });

  it('訪問済みノードへは戻れない（nextに含まれないため拒否）', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0');
    expect(() => selectNextNode(r1.state, 'f1n0')).toThrow(InvalidNodeSelectionError);
  });

  it('map外のnodeIdや別階層スキップは全seedで拒否される（30シード）', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = makeState(seed);
      const f3 = state.map.floors[2][0];
      expect(findNode(state.map, f3.id)).toBeTruthy();
      expect(() => selectNextNode(state, f3.id)).toThrow(InvalidNodeSelectionError);
    }
  });
});
