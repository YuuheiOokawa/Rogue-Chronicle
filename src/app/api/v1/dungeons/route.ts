import { NextResponse } from 'next/server';

import { DUNGEONS } from '@/constants/masters/dungeons';
import { apiHandler } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/** API-301 ダンジョン一覧取得（docs/13 §4.4） */
export const GET = apiHandler('API-301', async () => {
  const session = await requireUser();
  const progress = await prisma.playerProgress.findUnique({
    where: { userId: session.userId },
  });

  return NextResponse.json({
    items: DUNGEONS.map((d) => ({
      code: d.code,
      name: d.name,
      description: d.description,
      floors: d.floors,
      difficulties: d.difficulties.map((diff) => ({
        code: diff.code,
        name: diff.name,
        unlocked: diff.unlockCondition === null, // MVPはNormalのみ
      })),
      bestRecord: {
        bestFloor: progress?.bestFloor ?? 0,
        clearCount: progress?.totalClears ?? 0,
      },
    })),
  });
});
