import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { linkGuestSchema } from '@/schemas/auth';
import { apiHandler, clientIp, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { logger } from '@/server/services/logger';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import { AUTH_RATE_LIMIT, enforceRateLimit } from '@/server/services/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * API-006 ゲスト引き継ぎ（docs/13 §4.1 / docs/14 §4）。
 * ゲストユーザーへemail/passwordを付与し正式アカウント化する。user_idは変わらないため
 * ゲーム進行データの移行処理は不要。
 */
export const POST = apiHandler('API-006', async (traceId, req: Request) => {
  enforceRateLimit(`auth:link:${clientIp(req)}`, AUTH_RATE_LIMIT);
  const session = await requireUser();
  if (!session.isGuest) {
    throw new AppError('ERR_INVALID_ACTION', 'すでに正式アカウントです');
  }
  const input = await parseBody(req, linkGuestSchema);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('ERR_VALIDATION', 'このメールアドレスは使用できません', [
      { path: 'email', message: 'このメールアドレスは使用できません' },
    ]);
  }

  const passwordHash = await hash(input.password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.userId, isGuest: true },
      data: { email: input.email, passwordHash, isGuest: false },
    }),
    prisma.auditLog.create({
      data: { id: uuidv7(), userId: session.userId, action: 'guest_link', ip: clientIp(req) },
    }),
  ]);

  logger.info('guest_linked', { traceId, userId: session.userId });
  // 注意: セッションJWTのisGuestは次回トークン更新まで残るため、クライアントは応答後に
  // セッション更新（update）または再ログインを行う（SCR-006の画面仕様）
  return NextResponse.json({ ok: true });
});
