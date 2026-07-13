// イベント結果の確率抽選（docs/20 §2.26 executeRandomEvent の一部 / CORE_SPEC §5.8）。
// 選択肢（EventChoiceDef）が持つoutcomes（probability合計100）から累積確率で1件を抽選する。
// rng.weighted は「重み合計に対する累積区間選択」を既に実装しているため、
// probabilityをそのままweightとして渡すだけで「累積確率抽選」の要件を満たす。
import type { EventOutcome } from '@/constants/masters/types';
import type { Rng } from '@/domain/shared/rng';

/**
 * resolveEventOutcome（docs/20 §2.26）。
 * outcomes は呼び出し側（選択された EventChoiceDef.outcomes）を渡す。probability合計は100を想定するが、
 * 100でなくても rng.weighted は合計に対する比率で抽選するため決定的に動作する。
 */
export function resolveEventOutcome(
  outcomes: readonly EventOutcome[],
  rng: Rng,
): { resultText: string; effects: EventOutcome['effects'] } {
  if (outcomes.length === 0) {
    throw new RangeError('resolveEventOutcome: outcomes must not be empty');
  }
  const picked = rng.weighted(outcomes.map((o) => ({ item: o, weight: o.probability })));
  return { resultText: picked.resultText, effects: picked.effects };
}
