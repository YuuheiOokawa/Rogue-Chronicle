/**
 * シード付きPRNG（mulberry32）。DEC-019。
 *
 * domain層の乱数は必ずこのRngを引数注入で受け取る。Math.random()の直接使用は禁止
 * （eslintのno-restricted-propertiesで強制）。
 * seed + cursor を dungeon_runs.run_state に保存することで、同一ランの抽選を完全再現できる。
 * 抽選の呼び出し順を変える変更は再現性を壊すため、run_state.schemaVersion を上げること
 * （docs/20_Detailed_Design.md 実装時の注意点）。
 */
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** [min, max] の整数（両端含む） */
  int(min: number, max: number): number;
  /** 配列から1要素を等確率で選ぶ。空配列はエラー */
  pick<T>(arr: readonly T[]): T;
  /** 重み付き抽選。重み合計0以下はエラー */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  /** これまでに消費した乱数の個数。run_state.rngCursor へ書き戻す */
  readonly cursor: number;
}

/**
 * mulberry32本体。同一seedで同一系列を生成する32bit PRNG。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rngを生成する。cursor > 0 の場合はその回数だけ空読みして状態を復元する。
 * @param seed  32bit整数（0はPRNG退化のため1に補正。generateDungeonSeedと同規則）
 * @param cursor 復元位置（保存済みrun_state.rngCursor）
 */
export function createRng(seed: number, cursor = 0): Rng {
  const normalizedSeed = seed >>> 0 || 1;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new RangeError(`cursor must be a non-negative integer: ${cursor}`);
  }
  const raw = mulberry32(normalizedSeed);
  let consumed = 0;
  const take = (): number => {
    consumed += 1;
    return raw();
  };
  for (let i = 0; i < cursor; i += 1) take();

  return {
    next: () => take(),
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError(`invalid int range: [${min}, ${max}]`);
      }
      return min + Math.floor(take() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new RangeError('pick: empty array');
      return arr[Math.floor(take() * arr.length)] as (typeof arr)[number];
    },
    weighted(items) {
      const total = items.reduce((sum, x) => sum + x.weight, 0);
      if (total <= 0) throw new RangeError('weighted: total weight must be > 0');
      let r = take() * total;
      for (const entry of items) {
        r -= entry.weight;
        if (r < 0) return entry.item;
      }
      return items[items.length - 1].item; // 浮動小数点誤差の保険
    },
    get cursor() {
      return consumed;
    },
  };
}

/**
 * ダンジョンシード生成（docs/20 §2.1 generateDungeonSeed）。
 * 乱数源（entropy）はUseCase側が crypto.getRandomValues 等で用意して注入する。
 */
export function generateDungeonSeed(entropy: number): number {
  const seed = entropy >>> 0;
  return seed === 0 ? 1 : seed;
}
