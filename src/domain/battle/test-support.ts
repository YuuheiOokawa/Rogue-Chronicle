// テスト専用ヘルパ（*.test.ts以外なのでvitestには収集されない）。
// 境界値テストのためにnext()の返り値列を完全に制御できる疑似Rngを提供する。
import type { Rng } from '@/domain/shared/rng';

export function createFakeRng(sequence: readonly number[]): Rng {
  let i = 0;
  let consumed = 0;
  const take = (): number => {
    const v = sequence[i % sequence.length];
    i += 1;
    consumed += 1;
    return v;
  };
  return {
    next: () => take(),
    int(min, max) {
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
      return items[items.length - 1].item;
    },
    get cursor() {
      return consumed;
    },
  };
}
