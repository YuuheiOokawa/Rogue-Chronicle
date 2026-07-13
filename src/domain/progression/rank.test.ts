import { describe, expect, it } from 'vitest';

import { addRankExp, expToNextRank, RANK_CAP } from './rank';

describe('expToNextRank', () => {
  it('expToRank(R) = floor(100 × R^1.8)（CORE_SPEC §5.9）', () => {
    expect(expToNextRank(1)).toBe(100);
    expect(expToNextRank(2)).toBe(Math.floor(100 * Math.pow(2, 1.8)));
    expect(expToNextRank(8)).toBe(Math.floor(100 * Math.pow(8, 1.8)));
    expect(expToNextRank(50)).toBe(Math.floor(100 * Math.pow(50, 1.8)));
  });
});

describe('addRankExp', () => {
  it('ランクアップしない範囲では単純加算', () => {
    const r = addRankExp({ rank: 1, rankExp: 0 }, 50);
    expect(r).toEqual({ rank: 1, rankExp: 50, leveledUp: 0 });
  });

  it('境界值ちょうどでランクアップする', () => {
    const r = addRankExp({ rank: 1, rankExp: 0 }, expToNextRank(1));
    expect(r).toEqual({ rank: 2, rankExp: 0, leveledUp: 1 });
  });

  it('複数段のランクアップを一括処理する', () => {
    const need1 = expToNextRank(1);
    const need2 = expToNextRank(2);
    const r = addRankExp({ rank: 1, rankExp: 0 }, need1 + need2 + 10);
    expect(r).toEqual({ rank: 3, rankExp: 10, leveledUp: 2 });
  });

  it('上限RANK_CAPで頭打ちし、以降のexpは消費されず保持される', () => {
    const r = addRankExp({ rank: RANK_CAP, rankExp: 0 }, 999999);
    expect(r.rank).toBe(RANK_CAP);
    expect(r.rankExp).toBe(999999);
    expect(r.leveledUp).toBe(0);
  });
});
