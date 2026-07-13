import { NextResponse } from 'next/server';

import { DUNGEON_NODE_TYPES, DUNGEONS } from '@/constants/masters/dungeons';
import { ENEMIES } from '@/constants/masters/enemies';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/** API-302 ダンジョン詳細取得（docs/13 §4.4）。出現敵は図鑑登録済みのみ名前を開示 */
export const GET = apiHandler(
  'API-302',
  async (_traceId, _req: Request, ctx: { params: Promise<{ dungeonCode: string }> }) => {
    const session = await requireUser();
    const { dungeonCode } = await ctx.params;
    const dungeon = DUNGEONS.find((d) => d.code === dungeonCode);
    if (!dungeon) throw new AppError('ERR_NOT_FOUND');

    const discovered = await prisma.playerCodex.findMany({
      where: { userId: session.userId, entryType: 'enemy' },
      select: { entryCode: true },
    });
    const discoveredSet = new Set(discovered.map((d) => d.entryCode));

    return NextResponse.json({
      code: dungeon.code,
      name: dungeon.name,
      description: dungeon.description,
      floors: dungeon.floors,
      difficulties: dungeon.difficulties.map((diff) => ({
        code: diff.code,
        name: diff.name,
        unlocked: diff.unlockCondition === null,
      })),
      nodeTypes: DUNGEON_NODE_TYPES.map((t) => ({
        code: t.code,
        name: t.name,
        iconKey: t.iconKey,
        description: t.description,
      })),
      enemies: ENEMIES.filter((e) => !e.isSummon).map((e) => ({
        code: e.code,
        enemyType: e.enemyType,
        // 未発見の敵は名前を伏せる（docs/09 SCR-202: シルエット表示）
        name: discoveredSet.has(e.code) ? e.name : '???',
        discovered: discoveredSet.has(e.code),
      })),
    });
  },
);
