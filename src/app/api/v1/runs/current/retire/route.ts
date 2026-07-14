import { NextResponse } from 'next/server';

import { retireDungeon } from '@/domain/dungeon/finalize-status';
import { retireSchema } from '@/schemas/run';
import { apiHandler, parseBody } from '@/server/services/api';
import { logger } from '@/server/services/logger';
import { requireUser } from '@/server/services/session';
import {
  requireIdempotencyKey,
  withActiveRunMutation,
} from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/**
 * API-306 リタイア（docs/13 §4.4）。
 * DEC-025: リタイアは現在のphase（map_select/battle/reward_pending）を問わず、常に
 * status='retired'（持ち帰り率80%）へ遷移する。戦闘中でも敗北(50%)扱いにはしない
 * （docs/29 DEC-025で docs/09 SCR-314 の旧記述=「戦闘中は敗北扱い」を上書き済み）。
 * 通貨・ランクEXPの実付与はここでは行わない（API-307 finalizeで一括付与。docs/13 API-306 手順4）。
 */
export const POST = apiHandler('API-306', async (traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, retireSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-306',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      const nextState = retireDungeon(state);
      return {
        nextState,
        nextStatus: 'retired' as const,
        response: {
          retired: true,
          reachedFloor: nextState.position.floor,
          earned: nextState.earned,
        },
      };
    },
  );

  logger.info('run_retired', { traceId, userId: session.userId });
  return NextResponse.json({ ...(result.response as object), version: result.version });
});
