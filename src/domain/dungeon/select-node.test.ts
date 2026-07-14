import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import type { NodeTypeCode } from '@/constants/masters/types';

import { createRng } from '../shared/rng';
import { generateDungeonMap } from './generate-map';
import { bossNode, findNode, type DungeonMap } from './map-types';
import { createInitialRunState, type RunState } from './run-state';
import {
  BLESS_FIXED_EVENT_CODE,
  CURSE_FIXED_EVENT_CODE,
  InvalidNodeSelectionError,
  selectableNodeIds,
  selectNextNode,
} from './select-node';

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

/**
 * 単一ノードのみを持つカスタムマップでのRunState生成（非戦闘ノードの単体テスト用）。
 * selectableNodeIds()は position.nodeId===null のとき map.floors[0] を返すため、
 * floors配列の並びとnode.floor値を分離してよい（実ゲームプレイでは一致するが、
 * domain関数はnode.floorのみを報酬計算・イベント抽選条件に使うため単体テストでは支障ない）。
 */
function makeStateWithNode(
  nodeType: NodeTypeCode,
  floor: number,
  overrides?: Partial<RunState>,
  seed = 7,
): RunState {
  const map: DungeonMap = { seed, floors: [[{ id: 'f0n0', floor, type: nodeType, next: [] }]] };
  const rng = createRng(seed);
  const base = createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: null, armor: null, accessory: null },
    rngCursor: rng.cursor,
  });
  return { ...base, ...overrides };
}

describe('selectNextNode（docs/20 §2.3・Phase7本実装）', () => {
  it('未入場時は階層1のノードのみ選択可能', () => {
    const state = makeState();
    expect(selectableNodeIds(state)).toEqual(['f1n0']);
  });

  it('隣接ノード以外の選択を拒否する（不正進行防止）', () => {
    const state = makeState();
    expect(() => selectNextNode(state, 'f5n0')).toThrow(InvalidNodeSelectionError);
    expect(() => selectNextNode(state, 'nonexistent')).toThrow(InvalidNodeSelectionError);
  });

  it('戦闘ノードへ入場するとphase=battleへ遷移し、battle状態が生成される', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0'); // 階層1はBATTLE固定
    expect(r1.state.position).toMatchObject({ floor: 1, nodeId: 'f1n0', phase: 'battle' });
    expect(r1.state.visited).toContain('f1n0');
    expect(r1.state.battle).not.toBeNull();
    expect(r1.state.battle?.result).toBe('ongoing');
    expect(r1.state.battle?.enemies.length).toBeGreaterThan(0);
    expect(r1.cleared).toBe(false);
    expect(r1.stub).toBe(false);
    expect(r1.state.earned).toEqual(state.earned);
    expect(r1.state.rngCursor).toBeGreaterThan(state.rngCursor);
    expect(state.visited).toHaveLength(0);
    expect(state.battle).toBeNull();
  });

  it('戦闘ノード入場で出現した敵がencountered.enemiesへ蓄積される', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0');
    const enemyCodes = r1.state.battle!.enemies.map((e) => e.code);
    for (const code of enemyCodes) {
      expect(r1.state.encountered.enemies).toContain(code);
    }
  });

  it('nextBattleDebuff=weakenがセットされていると、戦闘開始時にプレイヤーへweakenが付与されクリアされる', () => {
    const state = { ...makeState(), nextBattleDebuff: 'weaken' as const };
    const r1 = selectNextNode(state, 'f1n0');
    expect(r1.state.battle?.player.statuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'weaken' })]),
    );
    expect(r1.state.nextBattleDebuff).toBeNull();
  });

  it('隣接をたどってボスまで到達でき、BOSSノードでphase=battleへ遷移する', () => {
    let state = makeState();
    const boss = bossNode(state.map);
    let guard = 0;
    let reachedBoss = false;
    while (guard++ < 20) {
      const candidates = selectableNodeIds(state);
      expect(candidates.length).toBeGreaterThan(0);
      const result = selectNextNode(state, candidates[0]);
      state = result.state;
      if (result.node.id === boss.id) {
        reachedBoss = true;
        expect(state.position.phase).toBe('battle');
        expect(state.battle?.nodeType).toBe('BOSS');
        break;
      }
      // 戦闘/非戦闘どちらの結果にも即座に決着させ、次のノード選択へ進める（テスト専用の簡易処理。
      // 実運用では戦闘勝敗はAPI-402、非戦闘の報酬受領はAPI-501〜508が担う）
      if (state.position.phase === 'battle') {
        state = { ...state, position: { ...state.position, phase: 'map_select' }, battle: null };
      } else if (state.position.phase === 'reward_pending') {
        state = { ...state, position: { ...state.position, phase: 'map_select' }, pendingReward: null };
      }
    }
    expect(reachedBoss).toBe(true);
    expect(state.visited).toHaveLength(10);
  });

  it('訪問済みノードへは戻れない（nextに含まれないため拒否）', () => {
    const state = makeState();
    const r1 = selectNextNode(state, 'f1n0');
    const backToMap: RunState = { ...r1.state, position: { ...r1.state.position, phase: 'map_select' }, battle: null };
    expect(() => selectNextNode(backToMap, 'f1n0')).toThrow(InvalidNodeSelectionError);
  });

  it('map外のnodeIdや別階層スキップは全seedで拒否される（30シード）', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = createRng(seed);
      const map = generateDungeonMap(seed, config, rng);
      const state = createInitialRunState({
        map,
        character: rain,
        equipment: { weapon: null, armor: null, accessory: null },
        rngCursor: rng.cursor,
      });
      const f3 = state.map.floors[2][0];
      expect(findNode(state.map, f3.id)).toBeTruthy();
      expect(() => selectNextNode(state, f3.id)).toThrow(InvalidNodeSelectionError);
    }
  });

  it('TREASURE: 宝箱内容を抽選しpendingReward=treasureでreward_pendingへ遷移する', () => {
    const state = makeStateWithNode('TREASURE', 3);
    const r = selectNextNode(state, 'f0n0');
    expect(r.state.position.phase).toBe('reward_pending');
    expect(r.state.pendingReward?.type).toBe('treasure');
    expect(r.state.visited).toContain('f0n0');
    expect(r.state.rngCursor).toBeGreaterThan(state.rngCursor);
  });

  it('SECRET: rt_treasure_secretは装備確定+ボーナス60Gが必ず付与される', () => {
    const state = makeStateWithNode('SECRET', 3);
    const r = selectNextNode(state, 'f0n0');
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('treasure');
    if (reward?.type === 'treasure') {
      expect(reward.rewardType).toBe('equipment');
      expect(reward.equipmentCode).toBeTruthy();
      expect(reward.goldAmount).toBe(60);
    }
  });

  it('SHOP: 5枠（装備2/消耗品2/レリック1）の品揃えが生成される', () => {
    const state = makeStateWithNode('SHOP', 4);
    const r = selectNextNode(state, 'f0n0');
    expect(r.state.pendingReward?.type).toBe('shop');
    if (r.state.pendingReward?.type === 'shop') {
      expect(r.state.pendingReward.slots).toHaveLength(5);
      expect(r.state.pendingReward.slots.filter((s) => s.kind === 'equipment')).toHaveLength(2);
      expect(r.state.pendingReward.slots.filter((s) => s.kind === 'consumable')).toHaveLength(2);
      expect(r.state.pendingReward.slots.filter((s) => s.kind === 'relic')).toHaveLength(1);
    }
  });

  it('REST: pendingReward={type:rest}でreward_pendingへ遷移する', () => {
    const state = makeStateWithNode('REST', 5);
    const r = selectNextNode(state, 'f0n0');
    expect(r.state.pendingReward).toEqual({ type: 'rest' });
    expect(r.state.position.phase).toBe('reward_pending');
  });

  it('EVENT: 出現階層条件を満たすRANDOM_EVENTSから1件抽選し選択肢ラベルを提示する', () => {
    const state = makeStateWithNode('EVENT', 5);
    const r = selectNextNode(state, 'f0n0');
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('event');
    if (reward?.type === 'event') {
      expect(reward.nodeType).toBe('EVENT');
      expect(reward.choices.length).toBeGreaterThanOrEqual(2);
      expect(reward.choices.length).toBeLessThanOrEqual(3);
      expect(reward.choices[0]).toEqual({ index: 0, label: expect.any(String) });
      expect(reward.autoResolved).toBeUndefined();
    }
  });

  it('BLESS: 固定3択（攻撃/防御/生命の加護）を提示する', () => {
    const state = makeStateWithNode('BLESS', 4);
    const r = selectNextNode(state, 'f0n0');
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('event');
    if (reward?.type === 'event') {
      expect(reward.nodeType).toBe('BLESS');
      expect(reward.eventCode).toBe(BLESS_FIXED_EVENT_CODE);
      expect(reward.choices).toHaveLength(3);
    }
  });

  it('CURSE: 固定2択（呪いを受け入れる/立ち去る）を提示する', () => {
    const state = makeStateWithNode('CURSE', 4);
    const r = selectNextNode(state, 'f0n0');
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('event');
    if (reward?.type === 'event') {
      expect(reward.nodeType).toBe('CURSE');
      expect(reward.eventCode).toBe(CURSE_FIXED_EVENT_CODE);
      expect(reward.choices).toHaveLength(2);
    }
  });

  it('HEAL: 自動解決でHPが回復しautoResolvedにresultTextが入る', () => {
    const base = makeStateWithNode('HEAL', 3);
    const hurt: RunState = { ...base, character: { ...base.character, hp: 1 } };
    const r = selectNextNode(hurt, 'f0n0');
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('event');
    if (reward?.type === 'event') {
      expect(reward.nodeType).toBe('HEAL');
      expect(reward.choices).toEqual([]);
      expect(reward.autoResolved?.claimed).toBe(false);
      expect(reward.autoResolved?.resultText).toEqual(expect.any(String));
    }
    expect(r.state.character.hp).toBeGreaterThan(1);
    expect(r.state.position.phase).toBe('reward_pending');
  });

  it('STORY: 自動解決でソウルシャード+5が加算される', () => {
    const state = makeStateWithNode('STORY', 3);
    const r = selectNextNode(state, 'f0n0');
    expect(r.state.earned.soulShards).toBe(state.earned.soulShards + 5);
    const reward = r.state.pendingReward;
    expect(reward?.type).toBe('event');
    if (reward?.type === 'event') {
      expect(reward.nodeType).toBe('STORY');
      expect(reward.autoResolved?.resultText).toEqual(expect.any(String));
    }
  });
});
