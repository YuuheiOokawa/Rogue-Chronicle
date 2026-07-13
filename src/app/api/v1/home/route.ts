import { NextResponse } from 'next/server';

import { expToNextRank } from '@/domain/progression/rank';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import type { HomeResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * API-101 ホーム情報取得（docs/13 §4.2）。
 * ホーム1画面=1リクエスト。progress/currencies/アクティブラン有無/公開中お知らせ3件を
 * まとめて返す（クエリはバッチ実行、N+1なし）。
 */
export const GET = apiHandler('API-101', async () => {
  const session = await requireUser();
  const now = new Date();

  const [user, activeRunCount, announcements] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { profile: true, progress: true, currencies: true },
    }),
    prisma.dungeonRun.count({ where: { userId: session.userId, status: 'active' } }),
    prisma.announcement.findMany({
      where: { publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 3,
      select: { id: true, title: true, category: true, publishedAt: true },
    }),
  ]);
  if (!user || user.status !== 'active') {
    throw new AppError('ERR_AUTH_SESSION_EXPIRED');
  }

  const rank = user.progress?.rank ?? 1;
  const body: HomeResponse = {
    player: {
      displayName: user.profile?.displayName ?? '冒険者',
      rank,
      rankExp: user.progress?.rankExp ?? 0,
      nextRankExp: expToNextRank(rank),
      soulShards: user.currencies?.soulShards ?? 0,
      isGuest: user.isGuest,
    },
    hasActiveRun: activeRunCount > 0,
    latestAnnouncements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      publishedAt: a.publishedAt.toISOString(),
    })),
    stats: {
      totalRuns: user.progress?.totalRuns ?? 0,
      totalClears: user.progress?.totalClears ?? 0,
      bestFloor: user.progress?.bestFloor ?? 0,
    },
  };
  return NextResponse.json(body);
});
