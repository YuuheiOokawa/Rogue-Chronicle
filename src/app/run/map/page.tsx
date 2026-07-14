import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { validateRunState } from '@/domain/dungeon/run-state';
import { RunMap } from '@/features/run/run-map';
import { prisma } from '@/server/services/prisma';
import { toRunView } from '@/server/usecases/run/run-view';

/**
 * SCR-301 ダンジョンマップ画面（docs/09 §4.6）。
 * 初期状態はサーバーで取得して渡し、以降の更新はクライアントがAPI-304/305で行う。
 */
export default async function RunMapPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: session.userId, status: { in: ['active', 'cleared', 'failed', 'retired'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) redirect('/dungeons');
  // 終了済みランは表示済みならダンジョン選択へ（activeのみマップ継続。cleared等は結果表示のため通す）
  let state;
  try {
    state = validateRunState(run.runState);
  } catch {
    // 破損検知: スナップショット復旧はPhase 9で実装（docs/15）。当面はダンジョン選択へ退避
    redirect('/dungeons');
  }

  // phaseに応じた画面へ強制遷移（リロード復帰時、docs/27 Phase7・Phase9で本格対応予定の簡易版）
  if (run.status === 'active' && state.position.phase === 'battle') {
    redirect('/run/battle');
  }
  if (run.status === 'active' && state.position.phase === 'reward_pending') {
    redirect('/run/reward');
  }

  return <RunMap initialView={toRunView(run, state)} />;
}
