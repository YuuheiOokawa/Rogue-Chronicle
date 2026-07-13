import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { ENEMIES } from '@/constants/masters/enemies';
import { SKILLS } from '@/constants/masters/skills';
import type { RunCharacter } from '@/domain/dungeon/run-state';
import { createRng } from '@/domain/shared/rng';

import { InvalidBattleActionError, executePlayerAction } from './execute-player-action';
import { startBattle } from './start-battle';
import { createFakeRng } from './test-support';
import type { BattleState } from './types';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;

function makeCharacter(overrides: Partial<RunCharacter> = {}): RunCharacter {
  return {
    code: rain.code,
    level: 1,
    exp: 0,
    stats: {
      maxHp: 100,
      atk: rain.baseStats.atk,
      def: rain.baseStats.def,
      spd: rain.baseStats.spd,
      critRate: 0,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 0,
    },
    hp: 100,
    sp: 10,
    maxSp: 10,
    ...overrides,
  };
}

function makeBattle(nodeType: BattleState['nodeType'] = 'BATTLE', floor = 1) {
  return startBattle({
    nodeId: `f${floor}n0`,
    nodeType,
    floor,
    character: makeCharacter(),
    difficultyStatMod: 1.0,
    masters: { enemies: ENEMIES },
    rng: createRng(1),
  });
}

describe('executePlayerAction: attack', () => {
  it('生存している敵への攻撃はダメージを与えSP+1する', () => {
    const character = makeCharacter({ sp: 5 });
    const battle = makeBattle();
    const result = executePlayerAction(battle, character, [], SKILLS, { type: 'attack', targetId: 'e0' }, createRng(2));
    expect(result.character.sp).toBe(6);
    expect(result.logs[0].action).toBe('attack');
  });

  it('存在しない/死亡した対象への攻撃はInvalidBattleActionError', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    expect(() =>
      executePlayerAction(battle, character, [], SKILLS, { type: 'attack', targetId: 'e99' }, createRng(2)),
    ).toThrow(InvalidBattleActionError);
  });
});

describe('executePlayerAction: skill', () => {
  const ownedSkills = [{ code: 'skill_power_strike', level: 1 }];

  it('未所持スキルはInvalidBattleActionError', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    expect(() =>
      executePlayerAction(battle, character, [], SKILLS, { type: 'skill', skillCode: 'skill_power_strike', targetId: 'e0' }, createRng(1)),
    ).toThrow(InvalidBattleActionError);
  });

  it('SP不足はInvalidBattleActionError', () => {
    const character = makeCharacter({ sp: 0 });
    const battle = makeBattle();
    expect(() =>
      executePlayerAction(
        battle,
        character,
        ownedSkills,
        SKILLS,
        { type: 'skill', skillCode: 'skill_power_strike', targetId: 'e0' },
        createRng(1),
      ),
    ).toThrow(InvalidBattleActionError);
  });

  it('SPを消費してダメージ効果を解決する', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    const result = executePlayerAction(
      battle,
      character,
      ownedSkills,
      SKILLS,
      { type: 'skill', skillCode: 'skill_power_strike', targetId: 'e0' },
      createRng(2),
    );
    expect(result.character.sp).toBe(character.sp - 3); // spCost=3
    expect(result.battle.enemies[0].hp).toBeLessThan(result.battle.enemies[0].stats.maxHp);
  });

  it('レベルスケーリングが反映される（skill_power_strike Lv2はmult1.7）', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    const lv1 = executePlayerAction(
      battle,
      character,
      [{ code: 'skill_power_strike', level: 1 }],
      SKILLS,
      { type: 'skill', skillCode: 'skill_power_strike', targetId: 'e0' },
      createFakeRng([0.01, 0.5, 0.5]),
    );
    const lv2 = executePlayerAction(
      battle,
      character,
      [{ code: 'skill_power_strike', level: 2 }],
      SKILLS,
      { type: 'skill', skillCode: 'skill_power_strike', targetId: 'e0' },
      createFakeRng([0.01, 0.5, 0.5]),
    );
    const dmg1 = battle.enemies[0].hp - lv1.battle.enemies[0].hp;
    const dmg2 = battle.enemies[0].hp - lv2.battle.enemies[0].hp;
    expect(dmg2).toBeGreaterThan(dmg1);
  });

  it('複数効果行は定義順(order)に解決される（毒針: damage→status）', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    const result = executePlayerAction(
      battle,
      character,
      [{ code: 'skill_poison_stab', level: 1 }],
      SKILLS,
      { type: 'skill', skillCode: 'skill_poison_stab', targetId: 'e0' },
      createFakeRng([0.01, 0.99, 0.5, 0.01]), // damage: evade,crit,variance / status: successRoll
    );
    expect(result.logs.some((l) => l.damage !== undefined)).toBe(true);
    expect(result.logs.some((l) => l.statusApplied === 'poison')).toBe(true);
  });
});

describe('executePlayerAction: guard', () => {
  it('guarding=trueかつSP+2', () => {
    const character = makeCharacter({ sp: 5 });
    const battle = makeBattle();
    const result = executePlayerAction(battle, character, [], SKILLS, { type: 'guard' }, createRng(1));
    expect(result.battle.player.guarding).toBe(true);
    expect(result.character.sp).toBe(7);
  });
});

describe('executePlayerAction: item', () => {
  it('potionはHPを回復する', () => {
    const character = makeCharacter({ hp: 10, stats: { ...makeCharacter().stats, maxHp: 100 } });
    const battle = { ...makeBattle(), player: { ...makeBattle().player, hp: 10 } };
    const result = executePlayerAction(
      battle,
      character,
      [],
      SKILLS,
      { type: 'item', itemCode: 'potion' },
      createRng(1),
    );
    expect(result.character.hp).toBeGreaterThan(10);
  });

  it('未対応アイテムはInvalidBattleActionError', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    expect(() =>
      executePlayerAction(battle, character, [], SKILLS, { type: 'item', itemCode: 'hi_potion' }, createRng(1)),
    ).toThrow(InvalidBattleActionError);
  });
});

describe('executePlayerAction: flee', () => {
  it('BOSS戦はflee不可', () => {
    const character = makeCharacter();
    const battle = makeBattle('BOSS', 10);
    expect(() => executePlayerAction(battle, character, [], SKILLS, { type: 'flee' }, createRng(1))).toThrow(
      InvalidBattleActionError,
    );
  });

  it('成功率clamp(50+(自spd-敵最速spd)*2,20,90)に基づき成功/失敗する', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    // 成功率は概ね50%前後。rng.next()*100 < rateなら成功
    const success = executePlayerAction(battle, character, [], SKILLS, { type: 'flee' }, createFakeRng([0]));
    expect(success.battle.result).toBe('fled');
    const fail = executePlayerAction(battle, character, [], SKILLS, { type: 'flee' }, createFakeRng([0.999]));
    expect(fail.battle.result).toBe('ongoing');
  });
});

describe('executePlayerAction: 行動不能', () => {
  it('stun中は行動がスキップされ、行動終了と同時にstunが解除される', () => {
    const character = makeCharacter();
    const battle = makeBattle();
    const stunned: BattleState = {
      ...battle,
      player: { ...battle.player, statuses: [{ code: 'stun', remainingTurns: 1 }] },
    };
    const result = executePlayerAction(stunned, character, [], SKILLS, { type: 'attack', targetId: 'e0' }, createRng(1));
    expect(result.battle.player.statuses).toEqual([]);
    expect(result.logs[0].note).toBe('incapacitated');
  });
});
