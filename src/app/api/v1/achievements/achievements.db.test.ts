// API-106 実績取得のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => {
    if (!mockUserId) throw new (await import('@/server/services/errors')).AppError(
      'ERR_AUTH_UNAUTHORIZED',
    );
    return { userId: mockUserId, isGuest: true, role: 'user' };
  },
}));

import { ACHIEVEMENTS } from '@/constants/masters/achievements';
import { prisma } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';
import type { AchievementsResponse } from '@/server/usecases/achievement/achievement-view';

import { GET } from './route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDbTests)('API-106 実績取得（DB統合）', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function createTestUser(): Promise<string> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;
    return user.id;
  }

  it('新規ユーザー: 全10件が未解除・sortOrder順・大半のprogressは0で返る', async () => {
    await createTestUser();

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as AchievementsResponse;

    expect(body.items).toHaveLength(ACHIEVEMENTS.length);
    // sortOrder順であること
    const sortedCodes = [...ACHIEVEMENTS].sort((a, b) => a.sortOrder - b.sortOrder).map((a) => a.code);
    expect(body.items.map((i) => i.code)).toEqual(sortedCodes);

    for (const item of body.items) {
      expect(item.unlocked).toBe(false);
      expect(item.unlockedAt).toBeNull();
      expect(item.progress).toBeGreaterThanOrEqual(0);
    }

    const firstRun = body.items.find((i) => i.code === 'ach_first_run')!;
    expect(firstRun).toMatchObject({ progress: 0, goal: 1 });
    const level20 = body.items.find((i) => i.code === 'ach_level_20')!;
    // runLevel系は永続追跡列がないため未解除時は常に0（docs/28 ISSUE-014）
    expect(level20).toMatchObject({ progress: 0, goal: 20 });
  });

  it('進捗反映: player_progress/player_achievements/player_codexの実データがprogress/unlockedへ反映される', async () => {
    const userId = await createTestUser();
    const unlockedAt = new Date('2026-07-05T12:00:00.000Z');

    await prisma.playerProgress.update({
      where: { userId },
      data: { totalRuns: 24, totalClears: 3, totalKills: 150, bestFloor: 5 },
    });
    await prisma.playerAchievement.create({
      data: { userId, achievementCode: 'ach_runs_10', unlockedAt },
    });
    // codexRatePct算出用: player_codexに1件登録（総数に対する割合はfloor丸め）
    await prisma.playerCodex.create({
      data: { userId, entryType: 'character', entryCode: 'swordsman_rain' },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as AchievementsResponse;

    const runs10 = body.items.find((i) => i.code === 'ach_runs_10')!;
    expect(runs10.unlocked).toBe(true);
    expect(runs10.unlockedAt).toBe(unlockedAt.toISOString());
    // goal到達済みでも実測値（累計24）をそのまま表示する（docs/13 API-106レスポンス例と同じ設計）
    expect(runs10).toMatchObject({ progress: 24, goal: 10 });

    const kills100 = body.items.find((i) => i.code === 'ach_kills_100')!;
    expect(kills100).toMatchObject({ unlocked: false, progress: 150, goal: 100 });

    const clear1 = body.items.find((i) => i.code === 'ach_first_clear')!;
    expect(clear1).toMatchObject({ unlocked: false, progress: 3, goal: 1 });
  });

  it('未認証: ERR_AUTH_UNAUTHORIZED(401)', async () => {
    mockUserId = '';
    const res = await GET();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_AUTH_UNAUTHORIZED');
  });
});
