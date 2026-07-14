import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { validateRunState } from '@/domain/dungeon/run-state';
import { RewardScreen } from '@/features/reward/reward-screen';
import { prisma } from '@/server/services/prisma';
import { toRunView } from '@/server/usecases/run/run-view';

/**
 * SCR-303〜308 報酬受領画面（docs/09 §5.4）。pendingReward.typeにより表示内容を出し分ける単一ルート。
 * 初期状態はサーバーで取得して渡し、以降の更新はクライアントがAPI-501〜508で行う。
 */
export default async function RunRewardPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: session.userId, status: 'active' },
  });
  if (!run) redirect('/dungeons');

  let state;
  try {
    state = validateRunState(run.runState);
  } catch {
    redirect('/dungeons');
  }
  if (state.position.phase !== 'reward_pending') {
    redirect(state.position.phase === 'battle' ? '/run/battle' : '/run/map');
  }

  return <RewardScreen initialView={toRunView(run, state)} />;
}
