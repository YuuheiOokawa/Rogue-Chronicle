import { describe, expect, it } from 'vitest';

import { resolveEffect, type EffectContext } from './skill-effects';
import { createFakeRng } from './test-support';
import type { CombatStats } from './types';

const actorStats: CombatStats = {
  maxHp: 100,
  atk: 20,
  def: 10,
  spd: 10,
  critRate: 0,
  critDmg: 150,
  eva: 0,
  acc: 0,
  statusRes: 0,
};
const targetStats: CombatStats = { ...actorStats, atk: 10, def: 10 };

function ctx(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    actor: { id: 'player', element: 'none', stats: actorStats },
    targets: [
      { id: 'e0', hp: 40, maxHp: 40, element: 'none', elemRes: 0, stats: targetStats, statuses: [], buffs: [], guarding: false },
    ],
    rng: createFakeRng([0.5]),
    ...overrides,
  };
}

describe('resolveEffect: damage', () => {
  it('通常ダメージ効果を解決する', () => {
    const result = resolveEffect('damage', { mult: 1.0 }, ctx({ rng: createFakeRng([0.5, 0.99, 0.5]) }));
    expect(result.targetResults[0].hpDelta).toBeLessThan(0);
    expect(result.damageDealt).toBeGreaterThan(0);
  });

  it('回避時はhpDelta0・isMiss=true', () => {
    // evasion roll: rng.next()*100>=hit(95) → 回避
    const result = resolveEffect('damage', { mult: 1.0 }, ctx({ rng: createFakeRng([0.999]) }));
    expect(result.targetResults[0].isMiss).toBe(true);
    expect(result.targetResults[0].hpDelta).toBe(0);
    expect(result.damageDealt).toBe(0);
  });

  it('bonusVsStatus: 対象が該当状態異常なら倍率が差し替わる', () => {
    const withStatus = ctx({
      targets: [
        {
          id: 'e0',
          hp: 40,
          maxHp: 40,
          element: 'none',
          elemRes: 0,
          stats: targetStats,
          statuses: [{ code: 'poison', remainingTurns: 1 }],
          buffs: [],
          guarding: false,
        },
      ],
      rng: createFakeRng([0.01, 0.99, 0.5]),
    });
    const result = resolveEffect(
      'damage',
      { mult: 1.0, bonusVsStatus: { status: 'poison', mult: 3.0 } },
      withStatus,
    );
    const noStatusResult = resolveEffect('damage', { mult: 1.0 }, ctx({ rng: createFakeRng([0.01, 0.99, 0.5]) }));
    expect(-result.targetResults[0].hpDelta).toBeGreaterThan(-noStatusResult.targetResults[0].hpDelta);
  });
});

describe('resolveEffect: damage_aoe', () => {
  it('全対象に個別のヒット/クリ/ダメージ判定を行う', () => {
    const result = resolveEffect(
      'damage_aoe',
      { mult: 1.0 },
      ctx({
        targets: [
          { id: 'e0', hp: 40, maxHp: 40, element: 'none', elemRes: 0, stats: targetStats, statuses: [], buffs: [], guarding: false },
          { id: 'e1', hp: 30, maxHp: 30, element: 'none', elemRes: 0, stats: targetStats, statuses: [], buffs: [], guarding: false },
        ],
        rng: createFakeRng([0.01, 0.99, 0.5, 0.01, 0.99, 0.5]),
      }),
    );
    expect(result.targetResults).toHaveLength(2);
    expect(result.damageDealt).toBeGreaterThan(0);
  });
});

describe('resolveEffect: heal', () => {
  it('maxHp基準%回復（必中・floor）', () => {
    const result = resolveEffect('heal', { hpPctOfMax: 25 }, ctx());
    expect(result.targetResults[0].hpDelta).toBe(10); // 40*0.25
  });
});

describe('resolveEffect: buff/debuff', () => {
  it('buffは必中で付与される', () => {
    const result = resolveEffect('buff', { buff: 'atkUp', valuePct: 25, turns: 3 }, ctx());
    expect(result.targetResults[0].buffApplied).toEqual({ code: 'atkUp', value: 25, remainingTurns: 3 });
  });

  it('debuffはchancePct省略時は必中', () => {
    const result = resolveEffect('debuff', { debuff: 'defDown', valuePct: 25, turns: 3 }, ctx());
    expect(result.targetResults[0].buffApplied).toEqual({ code: 'defDown', value: 25, remainingTurns: 3 });
  });

  it('debuffはchancePct指定時にロールする', () => {
    const fail = resolveEffect(
      'debuff',
      { debuff: 'atkDown', valuePct: 25, turns: 3, chancePct: 50 },
      ctx({ rng: createFakeRng([0.6]) }),
    );
    expect(fail.targetResults[0].buffApplied).toBeUndefined();
    const ok = resolveEffect(
      'debuff',
      { debuff: 'atkDown', valuePct: 25, turns: 3, chancePct: 50 },
      ctx({ rng: createFakeRng([0.2]) }),
    );
    expect(ok.targetResults[0].buffApplied).toBeDefined();
  });
});

describe('resolveEffect: status', () => {
  it('CORE_SPEC既定継続ターンで付与される', () => {
    const result = resolveEffect('status', { status: 'weaken', chancePct: 100 }, ctx());
    expect(result.targetResults[0].newStatuses).toEqual([{ code: 'weaken', remainingTurns: 3 }]);
    expect(result.targetResults[0].statusApplied).toEqual({ code: 'weaken', applied: true });
  });

  it('turns指定時はそちらを優先する', () => {
    const result = resolveEffect('status', { status: 'poison', chancePct: 100, turns: 1 }, ctx());
    expect(result.targetResults[0].newStatuses).toEqual([{ code: 'poison', remainingTurns: 1 }]);
  });
});

describe('resolveEffect: sp_gain', () => {
  it('actorSpDeltaを返す', () => {
    const result = resolveEffect('sp_gain', { amount: 4 }, ctx());
    expect(result.actorSpDelta).toBe(4);
    expect(result.targetResults).toEqual([]);
  });
});

describe('resolveEffect: lifesteal', () => {
  it('直前ダメージ×ratePctをactorHpDeltaとして返す', () => {
    const result = resolveEffect('lifesteal', { ratePct: 50 }, ctx({ previousDamage: 20 }));
    expect(result.actorHpDelta).toBe(10);
  });

  it('previousDamage未指定なら0', () => {
    const result = resolveEffect('lifesteal', { ratePct: 50 }, ctx());
    expect(result.actorHpDelta).toBe(0);
  });
});

describe('resolveEffect: cleanse', () => {
  it('付与順の古いものからcount件解除する', () => {
    const result = resolveEffect(
      'cleanse',
      { count: 1 },
      ctx({
        targets: [
          {
            id: 'player',
            hp: 100,
            maxHp: 100,
            element: 'none',
            elemRes: 0,
            stats: actorStats,
            statuses: [
              { code: 'poison', remainingTurns: 2 },
              { code: 'weaken', remainingTurns: 1 },
            ],
            buffs: [],
            guarding: false,
          },
        ],
      }),
    );
    expect(result.targetResults[0].newStatuses).toEqual([{ code: 'weaken', remainingTurns: 1 }]);
  });
});

describe('resolveEffect: shield/revive_guard/stat_passive/counter（Phase6は記録のみ）', () => {
  it('shieldはdescriptorをnoteに含めて返す（副作用なし）', () => {
    const result = resolveEffect('shield', { hpPctOfMax: 20, turns: null }, ctx());
    expect(result.note).toContain('shield');
    expect(result.targetResults).toEqual([]);
  });

  it('revive_guardはdescriptorをnoteに含めて返す', () => {
    const result = resolveEffect('revive_guard', { oncePerRun: true, surviveHp: 1 }, ctx());
    expect(result.note).toContain('revive_guard');
  });

  it('stat_passiveはdescriptorをnoteに含めて返す', () => {
    const result = resolveEffect('stat_passive', { stats: { critRate: 8 } }, ctx());
    expect(result.note).toContain('stat_passive');
  });

  it('counterはdescriptorをnoteに含めて返す', () => {
    const result = resolveEffect('counter', { mult: 0.6, onlyWhenDefending: true, chancePct: 100 }, ctx());
    expect(result.note).toContain('counter');
  });
});
