import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ResultScreen } from '@/features/result/result-screen';

/**
 * SCR-403 リザルト画面（docs/09 §4.10。SCR-404報酬獲得画面を統合）。
 * 表示データ・finalize実行（API-307）はすべてクライアント側で行う。
 */
export default async function RunResultPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <ResultScreen />;
}
