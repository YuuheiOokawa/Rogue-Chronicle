import { NextResponse } from 'next/server';

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
 * Phase 5時点の仮実装: status='retired' への遷移のみ（ソウルシャード80%等の
 * 永続報酬付与=API-307 finalize は Phase 8 で実装。docs/27 Phase 8）。
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
    (state) => ({
      nextState: state,
      nextStatus: 'retired' as const,
      response: { retired: true, earned: state.earned },
    }),
  );

  logger.info('run_retired', { traceId, userId: session.userId });
  return NextResponse.json({ ...(result.response as object), version: result.version });
});
