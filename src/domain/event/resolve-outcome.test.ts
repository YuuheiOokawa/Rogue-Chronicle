import { describe, expect, it } from 'vitest';

import type { EventOutcome } from '@/constants/masters/types';
import { createFakeRng } from '@/domain/battle/test-support';
import { createRng } from '@/domain/shared/rng';

import { resolveEventOutcome } from './resolve-outcome';

const outcomes: EventOutcome[] = [
  { probability: 60, resultText: 'A', effects: [{ type: 'gold', amount: 10 }] },
  { probability: 40, resultText: 'B', effects: [{ type: 'gold', amount: -10 }] },
];

describe('resolveEventOutcome', () => {
  it('probability境界: 0近傍(0)は先頭、境界(0.6)は2件目を選ぶ', () => {
    // take()=0 → r=0*100=0 → entry1(60): r=0-60=-60<0 → A
    expect(resolveEventOutcome(outcomes, createFakeRng([0])).resultText).toBe('A');
    // take()=0.6 → r=60 → entry1(60): r=60-60=0, not<0 → entry2(40): r=0-40=-40<0 → B
    expect(resolveEventOutcome(outcomes, createFakeRng([0.6])).resultText).toBe('B');
    // take()=0.599999 → r=59.9999 → entry1: r=59.9999-60=-0.0001<0 → A
    expect(resolveEventOutcome(outcomes, createFakeRng([0.599999])).resultText).toBe('A');
  });

  it('確率分布が大数で近似する', () => {
    const counts = { A: 0, B: 0 };
    const N = 5000;
    for (let seed = 1; seed <= N; seed += 1) {
      const r = resolveEventOutcome(outcomes, createRng(seed));
      counts[r.resultText as 'A' | 'B'] += 1;
    }
    expect(counts.A / N).toBeGreaterThan(0.52);
    expect(counts.A / N).toBeLessThan(0.68);
  });

  it('outcomesが空なら例外', () => {
    expect(() => resolveEventOutcome([], createFakeRng([0]))).toThrow();
  });

  it('選んだoutcomeのeffectsをそのまま返す', () => {
    const r = resolveEventOutcome(outcomes, createFakeRng([0]));
    expect(r.effects).toEqual([{ type: 'gold', amount: 10 }]);
  });
});
