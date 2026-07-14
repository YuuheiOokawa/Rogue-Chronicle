import { NextResponse } from 'next/server';

import { validateRunState } from '@/domain/dungeon/run-state';
import { apiHandler } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/**
 * API-501 レベルアップ候補取得（docs/13 §4.6）。
 * 保存済みのpendingReward.choicesを返すのみ。再抽選はしない（リロード連打対策・冪等性）。
 */
export const GET = apiHandler('API-501', async () => {
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
  if (state.pendingReward === null || state.pendingReward.type !== 'skill_choice') {
    throw new AppError('ERR_RUN_STATE_INVALID', '現在選択可能なスキル候補がありません');
  }
  const pending = state.pendingReward;

  return NextResponse.json({
    version: run.version,
    pending: {
      rerollRemaining: pending.rerollRemaining,
      choices: pending.choices.map((c, index) => ({
        index,
        skillCode: c.skillCode,
        isUpgrade: c.isUpgrade,
        rarity: c.rarity,
        currentLevel: c.isUpgrade
          ? (state.skills.find((s) => s.code === c.skillCode)?.level ?? null)
          : null,
      })),
    },
  });
});
