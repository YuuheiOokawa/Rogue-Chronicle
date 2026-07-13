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

  it('戦闘ノードへ入場するとphase=battleへ遷移し、battle状態が生成される（Phase6本実装）', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0'); // 階層1はBATTLE固定
    expect(r1.state.position).toMatchObject({ floor: 1, nodeId: 'f1n0', phase: 'battle' });
    expect(r1.state.visited).toContain('f1n0');
    expect(r1.state.battle).not.toBeNull();
    expect(r1.state.battle?.result).toBe('ongoing');
    expect(r1.state.battle?.enemies.length).toBeGreaterThan(0);
    // 未決着のためcleared=false・earnedは未加算（勝利時にAPI-402側で加算する）
    expect(r1.cleared).toBe(false);
    expect(r1.stub).toBe(false);
    expect(r1.state.earned).toEqual(state.earned);
    // 乱数消費分だけrngCursorが進む
    expect(r1.state.rngCursor).toBeGreaterThan(state.rngCursor);
    // 元のstateは不変（イミュータブル）
    expect(state.visited).toHaveLength(0);
    expect(state.battle).toBeNull();
  });

  it('隣接をたどってボスまで到達でき、BOSSノードでphase=battleへ遷移する', () => {
    let state = makeState();
    const boss = bossNode(state.map);
    let guard = 0;
    let reachedBoss = false;
    while (guard++ < 20) {
      const candidates = selectableNodeIds(state);
      expect(candidates.length).toBeGreaterThan(0);
      // ボスへ近づくため常に先頭を選ぶ（列グラフなので必ず前進する）
      const result = selectNextNode(state, candidates[0]);
      state = result.state;
      if (result.node.id === boss.id) {
        reachedBoss = true;
        expect(state.position.phase).toBe('battle');
        expect(state.battle?.nodeType).toBe('BOSS');
        break;
      }
      // 戦闘ノードに入ったらphaseがbattleへ遷移するため、次の選択ができるようmap_selectへ戻す
      // （実運用ではAPI-402が戦闘決着後にmap_selectへ復帰させる。テストではその代わりに直接戻す）
      if (state.position.phase === 'battle') {
        state = { ...state, position: { ...state.position, phase: 'map_select' }, battle: null };
      }
    }
    expect(reachedBoss).toBe(true);
    expect(state.visited).toHaveLength(10); // 階層1〜10で10ノード
  });

  it('訪問済みノードへは戻れない（nextに含まれないため拒否）', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0');
    const backToMap: RunState = { ...r1.state, position: { ...r1.state.position, phase: 'map_select' }, battle: null };
    expect(() => selectNextNode(backToMap, 'f1n0')).toThrow(InvalidNodeSelectionError);
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
