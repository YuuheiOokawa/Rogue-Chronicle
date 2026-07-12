import { describe, expect, it } from 'vitest';

import { createRng, generateDungeonSeed } from './rng';

describe('createRng (mulberry32)', () => {
  it('同一seedで同一系列を生成する（再現性・DEC-019）', () => {
    const a = createRng(123456789);
    const b = createRng(123456789);
    for (let i = 0; i < 100; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('異なるseedでは系列が異なる', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('cursorで途中状態を復元できる（途中再開の根幹）', () => {
    const original = createRng(42);
    for (let i = 0; i < 37; i += 1) original.next();
    const restored = createRng(42, 37);
    for (let i = 0; i < 20; i += 1) {
      expect(restored.next()).toBe(original.next());
    }
  });

  it('cursorが消費数を正確に数える', () => {
    const rng = createRng(7);
    expect(rng.cursor).toBe(0);
    rng.next();
    rng.int(1, 6);
    rng.pick(['a', 'b', 'c']);
    rng.weighted([
      { item: 'x', weight: 60 },
      { item: 'y', weight: 40 },
    ]);
    expect(rng.cursor).toBe(4);
  });

  it('next()は常に[0,1)の範囲', () => {
    const rng = createRng(999);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min,max)は両端を含む整数のみ返す', () => {
    const rng = createRng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(1, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4]));
  });

  it('weightedは重みに比例した分布になる（統計検証）', () => {
    const rng = createRng(555);
    let hitA = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i += 1) {
      const v = rng.weighted([
        { item: 'a', weight: 60 },
        { item: 'b', weight: 30 },
        { item: 'c', weight: 10 },
      ]);
      if (v === 'a') hitA += 1;
    }
    // 期待値60% ± 3%
    expect(hitA / trials).toBeGreaterThan(0.57);
    expect(hitA / trials).toBeLessThan(0.63);
  });

  it('weight=0の項目は選ばれない', () => {
    const rng = createRng(31337);
    for (let i = 0; i < 500; i += 1) {
      const v = rng.weighted([
        { item: 'never', weight: 0 },
        { item: 'always', weight: 1 },
      ]);
      expect(v).toBe('always');
    }
  });

  it('不正な引数を拒否する', () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => rng.weighted([{ item: 'x', weight: 0 }])).toThrow(RangeError);
    expect(() => createRng(1, -1)).toThrow(RangeError);
    expect(() => createRng(1, 1.5)).toThrow(RangeError);
  });
});

describe('generateDungeonSeed', () => {
  it('32bit非負整数へ正規化し、0は1へ補正する', () => {
    expect(generateDungeonSeed(0)).toBe(1);
    expect(generateDungeonSeed(-1)).toBe(4294967295);
    expect(generateDungeonSeed(123)).toBe(123);
    expect(generateDungeonSeed(2 ** 32 + 5)).toBe(5);
  });

  it('同一入力で同一出力（決定的）', () => {
    expect(generateDungeonSeed(777)).toBe(generateDungeonSeed(777));
  });
});
