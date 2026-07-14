import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { createInitialRunState, type RunState } from '@/domain/dungeon/run-state';
import { ZERO_UPGRADE_BONUS } from '@/domain/progression/apply-upgrades';
import { createRng } from '@/domain/shared/rng';

import { completeDungeon, failDungeon, FinalizeStatusError, retireDungeon } from './finalize-status';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
const ironSword = EQUIPMENT.find((e) => e.code === 'iron_sword')!;
const config = DUNGEONS[0].generationConfig;

function makeState(overrides: Partial<RunState> = {}): RunState {
  const seed = 1;
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, config, rng);
  const state = createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: ironSword, armor: null, accessory: null },
    rngCursor: rng.cursor,
    upgradeBonus: ZERO_UPGRADE_BONUS,
    startRelic: null,
  });
  return {
    ...state,
    earned: { ...state.earned, soulShards: 100, kills: 12 },
    ...overrides,
  };
}

describe('completeDungeon', () => {
  it('ソウルシャード100%+クリアボーナス50、rankExp=floor*10+kills*2+100', () => {
    const lastFloor = 10;
    const state = makeState({ position: { floor: lastFloor, nodeId: null, phase: 'map_select' } });
    const result = completeDungeon(state);
    expect(result.earned.soulShards).toBe(100 + 50);
    expect(result.earned.rankExp).toBe(lastFloor * 10 + 12 * 2 + 100);
    expect(result.battle).toBeNull();
    expect(result.pendingReward).toBeNull();
  });

  it('最終階層未到達なら例外', () => {
    const state = makeState({ position: { floor: 5, nodeId: null, phase: 'map_select' } });
    expect(() => completeDungeon(state)).toThrow(FinalizeStatusError);
  });

  it('端数はfloor丸め（切り捨て）', () => {
    const state = makeState({
      position: { floor: 10, nodeId: null, phase: 'map_select' },
      earned: { soulShards: 101, rankExp: 0, kills: 0, eliteKills: 0 },
    });
    const result = completeDungeon(state);
    // floor(101*1.0)=101 + 50
    expect(result.earned.soulShards).toBe(151);
  });
});

describe('failDungeon', () => {
  it('ソウルシャード50%、rankExpにクリアボーナスなし', () => {
    const state = makeState({
      position: { floor: 6, nodeId: null, phase: 'battle' },
      character: { ...makeState().character, hp: 0 },
      battle: null,
    });
    const result = failDungeon({ ...state, position: { ...state.position, phase: 'map_select' } });
    expect(result.earned.soulShards).toBe(50); // floor(100*0.5)
    expect(result.earned.rankExp).toBe(6 * 10 + 12 * 2);
  });

  it('hp>0なら例外', () => {
    const state = makeState();
    expect(() => failDungeon(state)).toThrow(FinalizeStatusError);
  });
});

describe('retireDungeon', () => {
  it('ソウルシャード80%（DEC-025: phase不問）', () => {
    for (const phase of ['map_select', 'battle', 'reward_pending'] as const) {
      const base = makeState({ position: { floor: 4, nodeId: null, phase: 'map_select' } });
      const state: RunState =
        phase === 'battle'
          ? { ...base, position: { ...base.position, phase: 'battle' }, battle: base.battle }
          : phase === 'reward_pending'
            ? {
                ...base,
                position: { ...base.position, phase: 'reward_pending' },
                pendingReward: { type: 'rest' },
              }
            : base;
      // battleがnullのままだとphase='battle'はvalidateRunStateに違反するため、ここではretireDungeon自体の
      // 事前条件なし挙動のみを検証する（phaseを直接いじった素のRunStateを渡す）
      const result = retireDungeon(state);
      expect(result.earned.soulShards).toBe(80); // floor(100*0.8)
      expect(result.battle).toBeNull();
      expect(result.pendingReward).toBeNull();
    }
  });
});
