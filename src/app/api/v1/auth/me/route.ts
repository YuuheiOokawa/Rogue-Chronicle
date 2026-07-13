import { NextResponse } from 'next/server';

import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/** API-004 自分の情報取得（docs/13 §4.1） */
export const GET = apiHandler('API-004', async () => {
  const session = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { profile: true, progress: true, currencies: true },
  });
  if (!user || user.status !== 'active') {
    throw new AppError('ERR_AUTH_SESSION_EXPIRED');
  }

  return NextResponse.json({
    userId: user.id,
    isGuest: user.isGuest,
    role: user.role,
    displayName: user.profile?.displayName ?? '冒険者',
    hasEmail: user.email !== null, // emailそのものは返さない（マスク表示は将来検討）
    rank: user.progress?.rank ?? 1,
    rankExp: user.progress?.rankExp ?? 0,
    soulShards: user.currencies?.soulShards ?? 0,
  });
});
