import { NextResponse } from 'next/server';

import { finalizeSchema } from '@/schemas/run';
import { apiHandler, parseBody } from '@/server/services/api';
import { logger } from '@/server/services/logger';
import { requireUser } from '@/server/services/session';
import { finalizeRun } from '@/server/usecases/run/finalize-run';
import { requireIdempotencyKey } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/**
 * API-307 リザルト確定（docs/13 §4.4・最重要）。
 * 対象は status IN ('cleared','failed','retired') のラン（withActiveRunMutationはactive限定の
 * ヘルパのため使えない。finalize-run.tsで同等の冪等キー確認・楽観ロック・保存を独自実装）。
 * ソウルシャード・ランクEXP・図鑑・実績・キャラ解放を1トランザクションで一括付与し、
 * status='finalized'へ一方向遷移する。二重finalizeはDB条件付きUPDATEで防止する。
 */
export const POST = apiHandler('API-307', async (traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, finalizeSchema);

  const result = await finalizeRun({
    userId: session.userId,
    idempotencyKey,
    expectedVersion: input.version,
  });

  logger.info('run_finalized', {
    traceId,
    userId: session.userId,
    replayed: result.replayed,
    finalStatus: result.response.finalStatus,
  });
  return NextResponse.json({ ...result.response, version: result.version });
});
