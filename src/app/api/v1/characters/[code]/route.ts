import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import {
  buildCharacterDetail,
  findCharacterMaster,
} from '@/server/usecases/character/character-view';
import type { CharacterDetailResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** パス変数はcharactersマスタのcode（docs/13 API-202、DEC-139） */
const paramsSchema = z.object({ code: z.string().regex(/^[a-z0-9_]{1,50}$/) });

/**
 * API-202 キャラクター詳細取得（docs/13 §4.3）。
 * 未解放キャラも閲覧可だが、詳細ステータス（baseStats/growthRates）は数値をマスクする。
 */
export const GET = apiHandler(
  'API-202',
  async (_traceId, _req: Request, ctx: { params: Promise<{ code: string }> }) => {
    const session = await requireUser();
    const { code } = paramsSchema.parse(await ctx.params);

    const character = findCharacterMaster(code);
    if (!character) {
      throw new AppError('ERR_NOT_FOUND', 'キャラクターが見つかりません');
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        characters: { where: { characterCode: code } },
        currencies: true,
        progress: true,
      },
    });
    if (!user || user.status !== 'active') {
      throw new AppError('ERR_AUTH_SESSION_EXPIRED');
    }

    const body: CharacterDetailResponse = buildCharacterDetail(
      character,
      user.characters.length > 0,
      {
        soulShards: user.currencies?.soulShards ?? 0,
        progress: {
          totalRuns: user.progress?.totalRuns ?? 0,
          totalClears: user.progress?.totalClears ?? 0,
          totalKills: user.progress?.totalKills ?? 0,
          bestFloor: user.progress?.bestFloor ?? 0,
        },
      },
    );
    return NextResponse.json(body);
  },
);
