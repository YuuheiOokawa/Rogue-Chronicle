import { NextResponse } from 'next/server';

import { validateRunState } from '@/domain/dungeon/run-state';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import { toBattleView } from '@/server/usecases/battle/battle-view';

export const dynamic = 'force-dynamic';

/**
 * API-401 戦闘状態取得（docs/13 §4.5・SCR-302）。
 * リロード復帰（SCR-101→再同期）にも本APIを使用する。
 */
export const GET = apiHandler('API-401', async () => {
  const session = await requireUser();
  const run = await prisma.dungeonRun.findFirst({
    where: { userId: session.userId, status: 'active' },
  });
  if (!run) throw new AppError('ERR_NOT_FOUND', '進行中の冒険がありません');

  let state;
  try {
    state = validateRunState(run.runState);
  } catch {
    throw new AppError('ERR_RUN_STATE_INVALID', '冒険データに問題が見つかりました');
  }
  if (state.position.phase !== 'battle' || state.battle === null) {
    throw new AppError('ERR_RUN_STATE_INVALID', '現在は戦闘中ではありません');
  }

  return NextResponse.json({
    version: run.version,
    battle: toBattleView(state.battle, state.character, state.skills, state.items),
  });
});
