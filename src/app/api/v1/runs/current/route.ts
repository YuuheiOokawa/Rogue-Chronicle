import { NextResponse } from 'next/server';

import { validateRunState } from '@/domain/dungeon/run-state';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import { toRunView } from '@/server/usecases/run/run-view';

export const dynamic = 'force-dynamic';

/**
 * API-304 現在ラン取得（再開兼用。docs/13 §4.4 / docs/15 途中再開）。
 * activeなランを返す。直近終了（cleared/retired/failed、未ファイナライズ）も再開画面用に返す。
 */
export const GET = apiHandler('API-304', async () => {
  const session = await requireUser();
  const run = await prisma.dungeonRun.findFirst({
    where: {
      userId: session.userId,
      status: { in: ['active', 'cleared', 'failed', 'retired'] },
    },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) throw new AppError('ERR_NOT_FOUND', '進行中の冒険がありません');

  let state;
  try {
    state = validateRunState(run.runState);
  } catch {
    throw new AppError('ERR_RUN_STATE_INVALID', '冒険データに問題が見つかりました');
  }
  return NextResponse.json(toRunView(run, state));
});
