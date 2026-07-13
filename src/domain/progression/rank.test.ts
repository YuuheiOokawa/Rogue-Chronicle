import { describe, expect, it } from 'vitest';

import { expToNextRank } from './rank';

describe('expToNextRank', () => {
  it('expToRank(R) = floor(100 × R^1.8)（CORE_SPEC §5.9）', () => {
    expect(expToNextRank(1)).toBe(100);
    expect(expToNextRank(2)).toBe(Math.floor(100 * Math.pow(2, 1.8)));
    expect(expToNextRank(8)).toBe(Math.floor(100 * Math.pow(8, 1.8)));
    expect(expToNextRank(50)).toBe(Math.floor(100 * Math.pow(50, 1.8)));
  });
});
