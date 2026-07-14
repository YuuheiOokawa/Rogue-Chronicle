import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiHandler } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import {
  buildCharacterCodexList,
  buildCodexSummary,
  buildEnemyCodexList,
  buildEquipmentCodexList,
  buildRelicCodexList,
  buildSkillCodexList,
  CODEX_ENTRY_TYPES,
  isCodexEntryType,
  type CodexEntryType,
} from '@/server/usecases/codex/codex-view';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  type: z.enum(CODEX_ENTRY_TYPES).optional(),
});

/**
 * API-601 図鑑取得（docs/13 §4.7。SCR-107〜110）。
 * `type`指定時: 該当マスタ全件を返す（発見済みは詳細、未発見は{code,discovered:false}のみ）。
 * `type`未指定時: 5種のサマリ（discoveredCount/totalCount）のみ返す。
 */
export const GET = apiHandler('API-601', async (_traceId, req: Request) => {
  const session = await requireUser();
  const url = new URL(req.url);
  const query = querySchema.parse({ type: url.searchParams.get('type') ?? undefined });

  const rows = await prisma.playerCodex.findMany({ where: { userId: session.userId } });

  if (query.type === undefined) {
    const discoveredCountByType: Record<CodexEntryType, number> = {
      skill: 0,
      relic: 0,
      enemy: 0,
      equipment: 0,
      character: 0,
    };
    for (const row of rows) {
      if (isCodexEntryType(row.entryType)) discoveredCountByType[row.entryType] += 1;
    }
    return NextResponse.json(buildCodexSummary(discoveredCountByType));
  }

  const discovered = new Set(
    rows.filter((r) => r.entryType === query.type).map((r) => r.entryCode),
  );

  switch (query.type) {
    case 'skill':
      return NextResponse.json(buildSkillCodexList(discovered));
    case 'relic':
      return NextResponse.json(buildRelicCodexList(discovered));
    case 'enemy':
      return NextResponse.json(buildEnemyCodexList(discovered));
    case 'equipment':
      return NextResponse.json(buildEquipmentCodexList(discovered));
    case 'character':
      return NextResponse.json(buildCharacterCodexList(discovered));
  }
});
