import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { validateRunState } from '@/domain/dungeon/run-state';
import { BattleScreen } from '@/features/battle/battle-screen';
import { prisma } from '@/server/services/prisma';
import { toBattleView } from '@/server/usecases/battle/battle-view';

/**
 * SCR-302 戦闘画面（docs/09 §4.7）。
 * 初期状態はサーバーで取得して渡し、以降はAPI-401/402をクライアントから呼ぶ（run/mapページと同じ方針）。
 */
export default async function RunBattlePage() {
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
  if (state.position.phase !== 'battle' || state.battle === null) {
    redirect('/run/map');
  }

  return (
    <BattleScreen
      initialVersion={run.version}
      initialBattle={toBattleView(state.battle, state.character, state.skills, state.items)}
    />
  );
}
