import { describe, expect, it } from 'vitest';

import { applyStatusEffect, isIncapacitated, resolveStatusTick, STATUS_DURATIONS } from './status-effects';
import { createFakeRng } from './test-support';
import type { StatusInstance } from './types';

describe('applyStatusEffect', () => {
  it('statusRes=100なら常に失敗する', () => {
    const r = applyStatusEffect([], 'poison', 80, 100, createFakeRng([0]));
    expect(r.applied).toBe(false);
  });

  it('成功率境界: baseRate80・statusRes0でrand79.99%は成功、80%は失敗', () => {
    const ok = applyStatusEffect([], 'poison', 80, 0, createFakeRng([0.7999]));
    expect(ok.applied).toBe(true);
    const ng = applyStatusEffect([], 'poison', 80, 0, createFakeRng([0.8]));
    expect(ng.applied).toBe(false);
  });

  it('statusRes適用で成功率が軽減される（80×(100-25)/100=60）', () => {
    const ok = applyStatusEffect([], 'poison', 80, 25, createFakeRng([0.5999]));
    expect(ok.applied).toBe(true);
    const ng = applyStatusEffect([], 'poison', 80, 25, createFakeRng([0.6]));
    expect(ng.applied).toBe(false);
  });

  it('新規付与時は規定継続ターンを設定する', () => {
    const r = applyStatusEffect([], 'weaken', 100, 0, createFakeRng([0]));
    expect(r.statuses).toEqual([{ code: 'weaken', remainingTurns: STATUS_DURATIONS.weaken }]);
  });

  it('重複時はremainingTurnsをリセットするのみ（他は変化しない）', () => {
    const current: StatusInstance[] = [{ code: 'weaken', remainingTurns: 1 }];
    const r = applyStatusEffect(current, 'weaken', 100, 0, createFakeRng([0]));
    expect(r.statuses).toEqual([{ code: 'weaken', remainingTurns: STATUS_DURATIONS.weaken }]);
    expect(r.statuses).toHaveLength(1);
  });
});

describe('resolveStatusTick', () => {
  it('poisonはmaxHpの8%ダメージ（floor）', () => {
    const r = resolveStatusTick({ hp: 100, maxHp: 100, statuses: [{ code: 'poison', remainingTurns: 1 }] });
    expect(r.hpDelta).toBe(-8);
    expect(r.entries).toEqual([{ code: 'poison', damage: 8 }]);
  });

  it('burnはmaxHpの5%ダメージ（floor）', () => {
    const r = resolveStatusTick({ hp: 100, maxHp: 100, statuses: [{ code: 'burn', remainingTurns: 1 }] });
    expect(r.hpDelta).toBe(-5);
  });

  it('poison+burnは両方適用され合算される', () => {
    const r = resolveStatusTick({
      hp: 100,
      maxHp: 100,
      statuses: [
        { code: 'poison', remainingTurns: 1 },
        { code: 'burn', remainingTurns: 1 },
      ],
    });
    expect(r.hpDelta).toBe(-13);
    expect(r.entries).toHaveLength(2);
  });

  it('他の状態異常はtickダメージを持たない', () => {
    const r = resolveStatusTick({ hp: 100, maxHp: 100, statuses: [{ code: 'stun', remainingTurns: 1 }] });
    expect(r.hpDelta).toBe(0);
    expect(r.entries).toEqual([]);
  });

  it('小さいmaxHpでも最低1ダメージ保証', () => {
    const r = resolveStatusTick({ hp: 5, maxHp: 5, statuses: [{ code: 'poison', remainingTurns: 1 }] });
    expect(r.entries[0].damage).toBe(1);
  });
});

describe('isIncapacitated', () => {
  it('stunがあれば必ずtrue（rng消費なし）', () => {
    const rng = createFakeRng([0.9999]);
    expect(isIncapacitated([{ code: 'stun', remainingTurns: 1 }], rng)).toBe(true);
    expect(rng.cursor).toBe(0);
  });

  it('paralysisは30%で不能（境界値）', () => {
    const ok = isIncapacitated([{ code: 'paralysis', remainingTurns: 1 }], createFakeRng([0.2999]));
    expect(ok).toBe(true);
    const ng = isIncapacitated([{ code: 'paralysis', remainingTurns: 1 }], createFakeRng([0.3]));
    expect(ng).toBe(false);
  });

  it('該当状態異常が無ければrng消費なしでfalse', () => {
    const rng = createFakeRng([0.9999]);
    expect(isIncapacitated([], rng)).toBe(false);
    expect(rng.cursor).toBe(0);
  });
});
