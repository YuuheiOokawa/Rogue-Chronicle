import { describe, expect, it } from 'vitest';

import {
  applyBuff,
  effectiveAtk,
  effectiveCritRate,
  effectiveDef,
  effectiveSpd,
  tickStatusAndBuffTurns,
} from './modifiers';
import type { BuffInstance, CombatStats, StatusInstance } from './types';

const stats: CombatStats = {
  maxHp: 100,
  atk: 20,
  def: 10,
  spd: 10,
  critRate: 5,
  critDmg: 150,
  eva: 0,
  acc: 0,
  statusRes: 0,
};

describe('effectiveAtk/effectiveDef/effectiveSpd/effectiveCritRate', () => {
  it('バフ無しは基礎値そのまま', () => {
    expect(effectiveAtk(stats, [], [])).toBe(20);
  });

  it('atkUpは%加算後に乗算', () => {
    const buffs: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 3 }];
    expect(effectiveAtk(stats, buffs, [])).toBe(Math.floor(20 * 1.25));
  });

  it('burnはatk-10%（statusとして別枠で乗算）', () => {
    const statuses: StatusInstance[] = [{ code: 'burn', remainingTurns: 2 }];
    expect(effectiveAtk(stats, [], statuses)).toBe(Math.floor(20 * 0.9));
  });

  it('atkUpとburnは乗算合成される（CORE_SPEC §6.2の例に一致: 1.25×0.90=1.125）', () => {
    const buffs: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 3 }];
    const statuses: StatusInstance[] = [{ code: 'burn', remainingTurns: 2 }];
    expect(effectiveAtk(stats, buffs, statuses)).toBe(Math.floor(20 * 1.25 * 0.9));
  });

  it('weakenはdef-25%', () => {
    const statuses: StatusInstance[] = [{ code: 'weaken', remainingTurns: 3 }];
    expect(effectiveDef(stats, [], statuses)).toBe(Math.floor(10 * 0.75));
  });

  it('atkUpとatkDownが同時にある場合は差分%で合成される', () => {
    const buffs: BuffInstance[] = [
      { code: 'atkUp', value: 25, remainingTurns: 3 },
      { code: 'atkDown', value: 25, remainingTurns: 3 },
    ];
    expect(effectiveAtk(stats, buffs, [])).toBe(20); // net 0%
  });

  it('spdUp/spdDownも同様に合成される', () => {
    const buffs: BuffInstance[] = [{ code: 'spdUp', value: 30, remainingTurns: 3 }];
    expect(effectiveSpd(stats, buffs)).toBe(Math.floor(10 * 1.3));
  });

  it('critUpは加算合成でclampされる', () => {
    const buffs: BuffInstance[] = [{ code: 'critUp', value: 15, remainingTurns: 3 }];
    expect(effectiveCritRate(stats, buffs)).toBe(20);
    const huge: BuffInstance[] = [{ code: 'critUp', value: 1000, remainingTurns: 3 }];
    expect(effectiveCritRate(stats, huge)).toBe(100);
  });
});

describe('applyBuff', () => {
  it('新規付与', () => {
    const result = applyBuff([], { code: 'atkUp', value: 25, remainingTurns: 3 });
    expect(result).toEqual([{ code: 'atkUp', value: 25, remainingTurns: 3 }]);
  });

  it('弱い値では上書きされない（value/remainingTurnsとも既存のmaxが残る）', () => {
    const current: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 3 }];
    const result = applyBuff(current, { code: 'atkUp', value: 10, remainingTurns: 1 });
    expect(result).toEqual([{ code: 'atkUp', value: 25, remainingTurns: 3 }]);
  });

  it('強い値で上書きされる', () => {
    const current: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 3 }];
    const result = applyBuff(current, { code: 'atkUp', value: 40, remainingTurns: 2 });
    expect(result).toEqual([{ code: 'atkUp', value: 40, remainingTurns: 3 }]); // valueは大きい方、turnsも大きい方
  });

  it('持続ターンのみ延長される場合', () => {
    const current: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 1 }];
    const result = applyBuff(current, { code: 'atkUp', value: 20, remainingTurns: 5 });
    expect(result).toEqual([{ code: 'atkUp', value: 25, remainingTurns: 5 }]);
  });

  it('異種バフは共存する', () => {
    const current: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 3 }];
    const result = applyBuff(current, { code: 'defUp', value: 25, remainingTurns: 3 });
    expect(result).toHaveLength(2);
  });
});

describe('tickStatusAndBuffTurns', () => {
  it('残りターンを1減らし0未満は除去する', () => {
    const statuses: StatusInstance[] = [
      { code: 'poison', remainingTurns: 1 },
      { code: 'weaken', remainingTurns: 3 },
    ];
    const buffs: BuffInstance[] = [{ code: 'atkUp', value: 25, remainingTurns: 1 }];
    const result = tickStatusAndBuffTurns(statuses, buffs);
    expect(result.statuses).toEqual([{ code: 'weaken', remainingTurns: 2 }]);
    expect(result.buffs).toEqual([]);
  });
});
