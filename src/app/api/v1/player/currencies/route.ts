import { NextResponse } from 'next/server';

import { apiHandler } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import type { CurrenciesResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** API-103 所持通貨取得（docs/13 §4.2。ゴールドはラン内通貨のため含めない） */
export const GET = apiHandler('API-103', async () => {
  const session = await requireUser();
  const currencies = await prisma.playerCurrency.findUnique({
    where: { userId: session.userId },
  });
  const body: CurrenciesResponse = { soulShards: currencies?.soulShards ?? 0 };
  return NextResponse.json(body);
});
