import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { EQUIPMENT } from '@/constants/masters/equipment';

import { createRng } from '../shared/rng';
import { generateDungeonMap } from './generate-map';
import { createInitialRunState, validateRunState } from './run-state';

const config = DUNGEONS[0].generationConfig;
const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
const ironSword = EQUIPMENT.find((e) => e.code === 'iron_sword')!;

function makeState() {
  const seed = 42;
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, config, rng);
  return createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: ironSword, armor: null, accessory: null },
    rngCursor: rng.cursor,
  });
}

describe('createInitialRunState / validateRunState', () => {
  it('初期状態がスキーマ検証を通過する', () => {
    const state = makeState();
    expect(() => validateRunState(state)).not.toThrow();
    expect(state.position).toEqual({ floor: 0, nodeId: null, phase: 'map_select' });
    expect(state.character.level).toBe(1);
    expect(state.character.hp).toBe(state.character.stats.maxHp);
    expect(state.gold).toBe(0);
    expect(state.items).toEqual([{ code: 'potion', count: 1 }]);
  });

  it('装備加算が反映される（レイン+アイアンソード=得意武器+10%）', () => {
    const state = makeState();
    const weaponAtk = ironSword.baseStats.atk ?? 0;
    // 剣士レインの得意武器はsword → 武器atk×1.1（切り捨て）
    expect(state.character.stats.atk).toBe(rain.baseStats.atk + Math.floor(weaponAtk * 1.1));
  });

  it('初期スキル+固有スキルがセットされる', () => {
    const state = makeState();
    const codes = state.skills.map((s) => s.code);
    for (const c of rain.initialSkillCodes) expect(codes).toContain(c);
    expect(codes).toContain(rain.innateSkillCode);
  });

  it('validateRunStateは不変条件違反を検知する', () => {
    const base = makeState();
    expect(() =>
      validateRunState({ ...base, character: { ...base.character, hp: base.character.stats.maxHp + 1 } }),
    ).toThrow();
    expect(() => validateRunState({ ...base, visited: ['f99n9'] })).toThrow();
    expect(() => validateRunState({ ...base, relics: ['lucky_coin', 'lucky_coin'] })).toThrow();
    expect(() => validateRunState({ ...base, schemaVersion: 999 })).toThrow();
    expect(() => validateRunState({ ...base, gold: -1 })).toThrow();
  });
});
