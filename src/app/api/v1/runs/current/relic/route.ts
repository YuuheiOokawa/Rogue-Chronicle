import { NextResponse } from 'next/server';

import type { RunState } from '@/domain/dungeon/run-state';
import { relicClaimSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/** 重複レリック受領時の代替ゴールド（docs/13 §4.6 API-508・仮決定） */
const DUPLICATE_RELIC_GOLD = 50;

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

/**
 * API-508 レリック取得確定（docs/13 §4.6）。
 * 現行UIの主経路（宝箱・イベント）はAPI-503/506内で完結するため、本APIは
 * pendingReward.type==='treasure' && rewardType==='relic' の受領確認という狭い用途に限定した
 * 予備実装（将来の単体relic提示UIに備えて公開のみしておく。実装指示に基づくスタブ的実装）。
 */
export const POST = apiHandler('API-508', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, relicClaimSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-508',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (
        state.pendingReward === null ||
        state.pendingReward.type !== 'treasure' ||
        state.pendingReward.rewardType !== 'relic' ||
        !state.pendingReward.relicCode
      ) {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在確定できるレリックがありません');
      }
      const relicCode = state.pendingReward.relicCode;
      const bonusGold = state.pendingReward.goldAmount ?? 0;

      let relics = state.relics;
      let gold = state.gold + bonusGold;
      let encountered = state.encountered;

      if (input.accept) {
        if (relics.includes(relicCode)) {
          gold += DUPLICATE_RELIC_GOLD;
        } else {
          relics = [...relics, relicCode];
        }
        encountered = { ...encountered, relics: addUnique(encountered.relics, relicCode) };
      }

      const nextState: RunState = {
        ...state,
        relics,
        gold,
        encountered,
        pendingReward: null,
        position: { ...state.position, phase: 'map_select' },
      };
      return { nextState, response: { accepted: input.accept, relicCode, position: nextState.position } };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
