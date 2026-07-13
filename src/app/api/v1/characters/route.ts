import { NextResponse } from 'next/server';

import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import {
  buildCharacterListItem,
  sortedCharacterMasters,
} from '@/server/usecases/character/character-view';
import type { CharactersResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * API-201 キャラクター一覧取得（docs/13 §4.3）。
 * マスタは定数（src/constants/masters）× 解放状態はplayer_characters。
 * 未解放キャラには解放条件の表示情報（必要シャード/実績名と進捗）を付与する。
 */
export const GET = apiHandler('API-201', async () => {
  const session = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { characters: true, currencies: true, progress: true },
  });
  if (!user || user.status !== 'active') {
    throw new AppError('ERR_AUTH_SESSION_EXPIRED');
  }

  const unlockedCodes = new Set(user.characters.map((c) => c.characterCode));
  const ctx = {
    soulShards: user.currencies?.soulShards ?? 0,
    progress: {
      totalRuns: user.progress?.totalRuns ?? 0,
      totalClears: user.progress?.totalClears ?? 0,
      totalKills: user.progress?.totalKills ?? 0,
      bestFloor: user.progress?.bestFloor ?? 0,
    },
  };

  const body: CharactersResponse = {
    items: sortedCharacterMasters().map((character) =>
      buildCharacterListItem(character, unlockedCodes.has(character.code), ctx),
    ),
  };
  return NextResponse.json(body);
});
