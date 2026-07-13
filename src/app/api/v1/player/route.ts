import { NextResponse } from 'next/server';

import { ACHIEVEMENTS } from '@/constants/masters';
import { expToNextRank } from '@/domain/progression/rank';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import type { PlayerResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** API-102 プレイヤー情報取得（docs/13 §4.2。SCR-102 プロフィール） */
export const GET = apiHandler('API-102', async () => {
  const session = await requireUser();

  const [user, unlockedAchievements] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { profile: true, progress: true },
    }),
    prisma.playerAchievement.count({ where: { userId: session.userId } }),
  ]);
  if (!user || user.status !== 'active') {
    throw new AppError('ERR_AUTH_SESSION_EXPIRED');
  }

  const rank = user.progress?.rank ?? 1;
  const body: PlayerResponse = {
    displayName: user.profile?.displayName ?? '冒険者',
    isGuest: user.isGuest,
    rank,
    rankExp: user.progress?.rankExp ?? 0,
    nextRankExp: expToNextRank(rank),
    stats: {
      totalRuns: user.progress?.totalRuns ?? 0,
      totalClears: user.progress?.totalClears ?? 0,
      totalKills: user.progress?.totalKills ?? 0,
      bestFloor: user.progress?.bestFloor ?? 0,
    },
    unlockedAchievements,
    totalAchievements: ACHIEVEMENTS.length,
  };
  return NextResponse.json(body);
});
