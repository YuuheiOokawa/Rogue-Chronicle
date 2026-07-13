import { NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { withdrawSchema } from '@/schemas/auth';
import { apiHandler, clientIp, parseBody } from '@/server/services/api';
import { logger } from '@/server/services/logger';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/**
 * API-008 退会（docs/13 §4.1 / docs/14 §6）。
 * 論理削除（status=withdrawn）→ 30日後に物理削除バッチ（Phase 13）。
 * 呼び出し後、クライアントは signOut する。
 */
export const DELETE = apiHandler('API-008', async (traceId, req: Request) => {
  const session = await requireUser();
  await parseBody(req, withdrawSchema);

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.userId },
      data: {
        status: 'withdrawn',
        withdrawnAt: now,
        // メールアドレスは即時解放する（再登録可能に。docs/14 §6、仮決定）
        email: null,
        passwordHash: null,
      },
    }),
    prisma.auditLog.create({
      data: { id: uuidv7(), userId: session.userId, action: 'withdraw', ip: clientIp(req) },
    }),
  ]);

  logger.info('user_withdrawn', { traceId, userId: session.userId });
  return NextResponse.json({ ok: true });
});
