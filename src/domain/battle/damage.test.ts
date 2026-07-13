import { describe, expect, it } from 'vitest';

import { calculateCritical, calculateDamage, calculateEvasion, ELEMENT_ADVANTAGE } from './damage';
import { createFakeRng } from './test-support';

describe('calculateEvasion', () => {
  it('acc0/eva0なら命中率95%（rand94.99%で命中、95%で回避）', () => {
    expect(calculateEvasion(0, 0, createFakeRng([0.9499]))).toBe(false);
    expect(calculateEvasion(0, 0, createFakeRng([0.95]))).toBe(true);
  });

  it('命中率は50%を下回らない（evaがどれだけ高くても）', () => {
    // hit = clamp(95+0-1000,50,100) = 50 → rand49.99%は命中、50%は回避
    expect(calculateEvasion(0, 1000, createFakeRng([0.4999]))).toBe(false);
    expect(calculateEvasion(0, 1000, createFakeRng([0.5]))).toBe(true);
  });

  it('命中率は100%を超えない（accがどれだけ高くても）', () => {
    // hit = clamp(95+1000-0,50,100) = 100 → rand99.99%でも命中
    expect(calculateEvasion(1000, 0, createFakeRng([0.9999]))).toBe(false);
  });
});

describe('calculateCritical', () => {
  it('critRate=0なら常にfalse', () => {
    expect(calculateCritical(0, createFakeRng([0]))).toBe(false);
  });

  it('critRate=100なら常にtrue', () => {
    expect(calculateCritical(100, createFakeRng([0.9999]))).toBe(true);
  });

  it('境界値: critRate5でrand4.99%はtrue、5%はfalse', () => {
    expect(calculateCritical(5, createFakeRng([0.0499]))).toBe(true);
    expect(calculateCritical(5, createFakeRng([0.05]))).toBe(false);
  });
});

describe('ELEMENT_ADVANTAGE', () => {
  it('fire→wind, wind→water, water→fireが有利、noneは対象なし', () => {
    expect(ELEMENT_ADVANTAGE.fire).toBe('wind');
    expect(ELEMENT_ADVANTAGE.wind).toBe('water');
    expect(ELEMENT_ADVANTAGE.water).toBe('fire');
    expect(ELEMENT_ADVANTAGE.none).toBeNull();
  });
});

describe('calculateDamage', () => {
  const base = {
    atk: 20,
    def: 15,
    skillMult: 1.5,
    element: 'none' as const,
    defenderElement: 'none' as const,
    defenderElemRes: 0,
    isCrit: false,
    critDmg: 150,
    guarding: false,
  };

  it('乱数境界0.90/1.10で基礎値どおりのダメージになる', () => {
    // 基礎値 = 20*1.5*(100/115) = 26.0869...
    const low = calculateDamage({ ...base, rng: createFakeRng([0]) }); // variance=0.90
    const high = calculateDamage({ ...base, rng: createFakeRng([0.999999]) }); // variance≒1.10
    expect(low.damage).toBe(Math.floor(26.0869565 * 0.9));
    expect(high.damage).toBe(Math.floor(26.0869565 * 1.0999978));
  });

  it('属性有利1.25倍', () => {
    const r = calculateDamage({ ...base, element: 'fire', defenderElement: 'wind', rng: createFakeRng([0.5]) });
    const variance = 0.9 + 0.5 * 0.2;
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 115) * 1.25 * 1.0 * variance)));
  });

  it('属性不利0.75倍', () => {
    const r = calculateDamage({ ...base, element: 'wind', defenderElement: 'fire', rng: createFakeRng([0.5]) });
    const variance = 0.9 + 0.5 * 0.2;
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 115) * 0.75 * 1.0 * variance)));
  });

  it('等倍属性（火 vs 火など有利不利いずれでもない）は1.0倍', () => {
    const r = calculateDamage({ ...base, element: 'fire', defenderElement: 'fire', rng: createFakeRng([0.5]) });
    const variance = 0.9 + 0.5 * 0.2;
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 115) * 1.0 * 1.0 * variance)));
  });

  it('elemResは上限50%で軽減', () => {
    const r = calculateDamage({
      ...base,
      element: 'fire',
      defenderElement: 'wind',
      defenderElemRes: 999, // 上限50%にclampされる
      rng: createFakeRng([0.5]),
    });
    const variance = 0.9 + 0.5 * 0.2;
    const elemMod = 1.25 * ((100 - 50) / 100);
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 115) * elemMod * 1.0 * variance)));
  });

  it('クリティカル時はcritDmg/100倍', () => {
    const r = calculateDamage({ ...base, isCrit: true, critDmg: 150, rng: createFakeRng([0.5]) });
    const variance = 0.9 + 0.5 * 0.2;
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 115) * 1.0 * 1.5 * variance)));
  });

  it('防御コマンド選択中は最終ダメージ50%減（floor後）', () => {
    const normal = calculateDamage({ ...base, rng: createFakeRng([0.5]) });
    const guarded = calculateDamage({ ...base, guarding: true, rng: createFakeRng([0.5]) });
    expect(guarded.damage).toBe(Math.max(1, Math.floor(normal.damage * 0.5)));
  });

  it('defが極端に大きくても最低1ダメージを保証する', () => {
    const r = calculateDamage({ ...base, atk: 1, def: 100000, rng: createFakeRng([0]) });
    expect(r.damage).toBe(1);
  });

  it('def逓減曲線: defが増えるほど1あたりの軽減効果が小さくなる（減少幅が単調減少）', () => {
    const dmgAt = (def: number): number => calculateDamage({ ...base, def, rng: createFakeRng([0.5]) }).damage;
    const d0 = dmgAt(0);
    const d10 = dmgAt(10);
    const d20 = dmgAt(20);
    const d100 = dmgAt(100);
    const drop1 = d0 - d10;
    const drop2 = d10 - d20;
    expect(drop1).toBeGreaterThan(0);
    expect(drop2).toBeGreaterThan(0);
    expect(drop1).toBeGreaterThan(drop2); // 逓減
    expect(d100).toBeGreaterThanOrEqual(1);
  });

  it('def=0では逓減式の分母が100のみになる', () => {
    const r = calculateDamage({ ...base, def: 0, rng: createFakeRng([0.5]) });
    const variance = 0.9 + 0.5 * 0.2;
    expect(r.damage).toBe(Math.max(1, Math.floor(20 * 1.5 * (100 / 100) * 1.0 * 1.0 * variance)));
  });
});
