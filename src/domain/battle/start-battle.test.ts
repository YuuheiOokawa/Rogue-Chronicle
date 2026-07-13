import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { ENEMIES } from '@/constants/masters/enemies';
import { createRng } from '@/domain/shared/rng';

import { scaleStats, startBattle } from './start-battle';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;

function makeCharacter(level = 1) {
  return {
    code: rain.code,
    level,
    exp: 0,
    stats: {
      maxHp: rain.baseStats.maxHp,
      atk: rain.baseStats.atk,
      def: rain.baseStats.def,
      spd: rain.baseStats.spd,
      critRate: rain.baseStats.critRate,
      critDmg: rain.baseStats.critDmg,
      eva: rain.baseStats.eva,
      acc: rain.baseStats.acc,
      statusRes: rain.baseStats.statusRes,
    },
    hp: rain.baseStats.maxHp,
    sp: 10,
    maxSp: 10,
  };
}

describe('scaleStats', () => {
  it('階層補正: stat(floor) = round(base × (1+0.12×(floor-1)) × difficultyStatMod)', () => {
    const stats = scaleStats(
      { maxHp: 40, atk: 10, def: 6, spd: 8, critRate: 5, critDmg: 150, eva: 0, acc: 0, statusRes: 0 },
      3,
      1.0,
      'normal',
    );
    // floorCoef(3) = 1+0.12*2 = 1.24
    expect(stats.def).toBe(Math.round(6 * 1.24));
    expect(stats.spd).toBe(Math.round(8 * 1.24));
  });

  it('strong/elite/boss種別補正はHP/ATKのみに掛かる', () => {
    const base = { maxHp: 100, atk: 20, def: 10, spd: 10, critRate: 5, critDmg: 150, eva: 0, acc: 0, statusRes: 0 };
    const normal = scaleStats(base, 1, 1.0, 'normal');
    const strong = scaleStats(base, 1, 1.0, 'strong');
    const elite = scaleStats(base, 1, 1.0, 'elite');
    const boss = scaleStats(base, 1, 1.0, 'boss');
    expect(strong.maxHp).toBe(Math.round(normal.maxHp * 1.5));
    expect(strong.def).toBe(normal.def); // DEFは種別補正なし
    expect(elite.maxHp).toBe(Math.round(normal.maxHp * 2.0));
    expect(boss.maxHp).toBe(Math.round(normal.maxHp * 4.0));
    expect(boss.atk).toBe(Math.round(normal.atk * 1.5));
  });
});

describe('startBattle', () => {
  it('BOSSノードでは必ずruin_guardianが編成される', () => {
    const battle = startBattle({
      nodeId: 'f10n0',
      nodeType: 'BOSS',
      floor: 10,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
      rng: createRng(1),
    });
    expect(battle.enemies).toHaveLength(1);
    expect(battle.enemies[0].code).toBe('ruin_guardian');
    expect(battle.bossPhase).toBe(1);
    expect(battle.canFlee).toBe(false);
  });

  it('ELITEノードでは1体のエリート敵が編成される', () => {
    const battle = startBattle({
      nodeId: 'f5n0',
      nodeType: 'ELITE',
      floor: 5,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
      rng: createRng(1),
    });
    expect(battle.enemies).toHaveLength(1);
    expect(['orc_champion', 'dark_shaman']).toContain(battle.enemies[0].code);
    expect(battle.canFlee).toBe(false);
  });

  it('階層1-3のBATTLEノードは1体固定', () => {
    const battle = startBattle({
      nodeId: 'f2n0',
      nodeType: 'BATTLE',
      floor: 2,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
      rng: createRng(1),
    });
    expect(battle.enemies).toHaveLength(1);
    expect(battle.canFlee).toBe(true);
  });

  it('全ての敵に初期intentが設定される', () => {
    const battle = startBattle({
      nodeId: 'f5n0',
      nodeType: 'BATTLE',
      floor: 5,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
      rng: createRng(2),
    });
    for (const e of battle.enemies) {
      expect(e.intent).not.toBeNull();
    }
  });

  it('同一rngシードなら同一編成になる（決定性）', () => {
    const params = {
      nodeId: 'f5n0',
      nodeType: 'BATTLE' as const,
      floor: 5,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
    };
    const a = startBattle({ ...params, rng: createRng(777) });
    const b = startBattle({ ...params, rng: createRng(777) });
    expect(a.enemies.map((e) => e.code)).toEqual(b.enemies.map((e) => e.code));
    expect(a.order).toEqual(b.order);
  });

  it('行動順にplayerと敵のspdが正しく反映される', () => {
    const battle = startBattle({
      nodeId: 'f1n0',
      nodeType: 'BATTLE',
      floor: 1,
      character: makeCharacter(),
      difficultyStatMod: 1.0,
      masters: { enemies: ENEMIES },
      rng: createRng(1),
    });
    expect(battle.order).toContain('player');
    expect(battle.order).toContain('e0');
  });
});
