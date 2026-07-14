import { NextResponse } from 'next/server';

import { apiHandler } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import {
  buildAchievementListItem,
  sortedAchievementMasters,
  type AchievementProgressContext,
  type AchievementsResponse,
} from '@/server/usecases/achievement/achievement-view';

export const dynamic = 'force-dynamic';

/**
 * API-106 実績取得（docs/13 §4.2。SCR-111 実績一覧画面）。
 * achievementsマスタ（定数10件）とplayer_achievements/player_progress/player_codexを結合して返す。
 */
export const GET = apiHandler('API-106', async () => {
  const session = await requireUser();

  const [progress, playerAchievements, playerCodex] = await prisma.$transaction([
    prisma.playerProgress.findUnique({ where: { userId: session.userId } }),
    prisma.playerAchievement.findMany({ where: { userId: session.userId } }),
    prisma.playerCodex.findMany({ where: { userId: session.userId } }),
  ]);

  const unlockedAtByCode = new Map(
    playerAchievements.map((a) => [a.achievementCode, a.unlockedAt]),
  );

  const ctx: AchievementProgressContext = {
    totalRuns: progress?.totalRuns ?? 0,
    totalClears: progress?.totalClears ?? 0,
    totalDefeats: progress?.totalDefeats ?? 0,
    totalKills: progress?.totalKills ?? 0,
    eliteKills: progress?.eliteKills ?? 0,
    bestFloor: progress?.bestFloor ?? 0,
    codexEntryCount: playerCodex.length,
  };

  const body: AchievementsResponse = {
    items: sortedAchievementMasters().map((achievement) => {
      const unlockedAt = unlockedAtByCode.get(achievement.code) ?? null;
      return buildAchievementListItem(achievement, unlockedAt !== null, unlockedAt, ctx);
    }),
  };
  return NextResponse.json(body);
});
