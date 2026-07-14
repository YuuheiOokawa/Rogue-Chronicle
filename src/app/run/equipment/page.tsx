import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { validateRunState } from '@/domain/dungeon/run-state';
import { EquipmentScreen } from '@/features/reward/equipment-screen';
import { prisma } from '@/server/services/prisma';
import { toRunView } from '@/server/usecases/run/run-view';

/**
 * SCR-309 装備変更 / SCR-312 所持品確認（docs/09 §5.4）。
 * 戦闘中（phase='battle'）は変更不可のためマップ/戦闘画面へ誘導する。
 */
export default async function RunEquipmentPage() {
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
  if (state.position.phase === 'battle') {
    redirect('/run/battle');
  }

  return <EquipmentScreen initialView={toRunView(run, state)} />;
}
