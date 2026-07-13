import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';

import { registerSchema } from '@/schemas/auth';
import { apiHandler, clientIp, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { logger } from '@/server/services/logger';
import { prisma } from '@/server/services/prisma';
import { AUTH_RATE_LIMIT, enforceRateLimit } from '@/server/services/rate-limit';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';

export const dynamic = 'force-dynamic';

/**
 * API-001 ユーザー登録（docs/13 §4.1）。
 * 登録成功後、クライアントは signIn('credentials') でログインする。
 */
export const POST = apiHandler('API-001', async (traceId, req: Request) => {
  enforceRateLimit(`auth:register:${clientIp(req)}`, AUTH_RATE_LIMIT);
  const input = await parseBody(req, registerSchema);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // メールアドレスの存在有無を悟らせないため、validationと同じ400系で返す（docs/14）
    throw new AppError('ERR_VALIDATION', 'このメールアドレスは使用できません', [
      { path: 'email', message: 'このメールアドレスは使用できません' },
    ]);
  }

  const passwordHash = await hash(input.password, 12); // bcrypt cost12（docs/14 §2）
  const user = await createUserWithDefaults({
    email: input.email,
    passwordHash,
    isGuest: false,
    displayName: input.displayName ?? '冒険者',
  });

  logger.info('user_registered', { traceId, userId: user.id });
  return NextResponse.json({ userId: user.id }, { status: 201 });
});
