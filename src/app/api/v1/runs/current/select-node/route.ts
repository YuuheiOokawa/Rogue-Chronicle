import { NextResponse } from 'next/server';

import { InvalidNodeSelectionError, selectNextNode } from '@/domain/dungeon/select-node';
import { selectNodeSchema } from '@/schemas/run';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import {
  requireIdempotencyKey,
  withActiveRunMutation,
} from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/**
 * API-305 次ノード選択（docs/13 §4.4・重要）。
 * 共通順序: 冪等キー確認 → version検証 → 正当性検証（隣接・phase）→ domain解決 → 保存。
 * Phase 5: 全ノードはスタブ解決（戦闘スタブ勝利・BOSSでstatus='cleared'）。Phase 6/7で本実装。
 */
export const POST = apiHandler('API-305', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, selectNodeSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-305',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      let outcome;
      try {
        outcome = selectNextNode(state, input.nodeId);
      } catch (err) {
        if (err instanceof InvalidNodeSelectionError) {
          throw new AppError('ERR_INVALID_ACTION', '選択できないノードです');
        }
        throw err;
      }
      return {
        nextState: outcome.state,
        nextStatus: outcome.cleared ? ('cleared' as const) : ('active' as const),
        snapshot: true, // ノード開始時点をチェックポイント保存（docs/15）
        response: {
          node: { id: outcome.node.id, floor: outcome.node.floor, type: outcome.node.type },
          cleared: outcome.cleared,
          stub: outcome.stub,
          position: outcome.state.position,
          visited: outcome.state.visited,
          earned: outcome.state.earned,
        },
      };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
