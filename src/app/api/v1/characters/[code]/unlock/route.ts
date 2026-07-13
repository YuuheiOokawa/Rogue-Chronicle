import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { unlockCharacter } from '@/server/usecases/character/unlock-character';
import type { UnlockResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ code: z.string().regex(/^[a-z0-9_]{1,50}$/) });

/**
 * API-203 キャラクター解放（docs/13 §4.3）。
 * currency_transactions.idempotency_key がUNIQUEのため Idempotency-Key ヘッダを必須とする
 * （欠落は400 ERR_VALIDATION）。同一キー再送は保存済みの成功応答相当を返す。
 */
export const POST = apiHandler(
  'API-203',
  async (_traceId, req: Request, ctx: { params: Promise<{ code: string }> }) => {
    const session = await requireUser();
    const { code } = paramsSchema.parse(await ctx.params);

    const idempotencyKey = req.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new AppError('ERR_VALIDATION', 'Idempotency-Keyヘッダが必要です', [
        { path: 'Idempotency-Key', message: '必須ヘッダです（200文字以内）' },
      ]);
    }

    const result = await unlockCharacter({
      userId: session.userId,
      characterCode: code,
      idempotencyKey,
    });

    const body: UnlockResponse = {
      characterCode: result.characterCode,
      unlocked: true,
      currencies: { soulShards: result.soulShards },
    };
    return NextResponse.json(body);
  },
);
