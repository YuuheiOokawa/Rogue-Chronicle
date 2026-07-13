import { describe, expect, it } from 'vitest';

import { checkBattleEnd } from './check-end';
import type { BattleState, EnemyInstance } from './types';

function makeEnemy(overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    instanceId: 'e0',
    code: 'goblin',
    name: 'ゴブリン',
    element: 'none',
    stats: { maxHp: 40, atk: 10, def: 6, spd: 8, critRate: 5, critDmg: 150, eva: 0, acc: 0, statusRes: 0 },
    hp: 40,
    statuses: [],
    buffs: [],
    guarding: false,
    intent: null,
    alive: true,
    isSummon: false,
    recentActionCodes: [],
    ...overrides,
  };
}

function makeBattle(overrides: Partial<BattleState> = {}): BattleState {
  return {
    nodeId: 'f1n0',
    nodeType: 'BATTLE',
    turnNo: 1,
    order: ['player', 'e0'],
    player: { hp: 100, sp: 10, statuses: [], buffs: [], guarding: false },
    enemies: [makeEnemy()],
    log: [],
    result: 'ongoing',
    bossPhase: null,
    canFlee: true,
    ...overrides,
  };
}

describe('checkBattleEnd', () => {
  it('プレイヤーhp<=0なら敗北（優先）', () => {
    const battle = makeBattle({ player: { hp: 0, sp: 0, statuses: [], buffs: [], guarding: false } });
    expect(checkBattleEnd(battle)).toBe('lose');
  });

  it('相打ち（プレイヤー・敵とも全滅）は敗北を優先する', () => {
    const battle = makeBattle({
      player: { hp: 0, sp: 0, statuses: [], buffs: [], guarding: false },
      enemies: [makeEnemy({ hp: 0, alive: false })],
    });
    expect(checkBattleEnd(battle)).toBe('lose');
  });

  it('敵全滅なら勝利', () => {
    const battle = makeBattle({ enemies: [makeEnemy({ hp: 0, alive: false })] });
    expect(checkBattleEnd(battle)).toBe('win');
  });

  it('召喚敵が生存中はwinにならない', () => {
    const battle = makeBattle({
      enemies: [makeEnemy({ hp: 0, alive: false }), makeEnemy({ instanceId: 'e1', hp: 5, alive: true, isSummon: true })],
    });
    expect(checkBattleEnd(battle)).toBeNull();
  });

  it('継続中はnull', () => {
    expect(checkBattleEnd(makeBattle())).toBeNull();
  });
});
