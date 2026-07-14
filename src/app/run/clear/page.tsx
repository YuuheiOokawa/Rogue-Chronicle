import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ClearScreen } from '@/features/result/clear-screen';

/** SCR-401 クリア画面（docs/09 §5.5）。表示データはクライアント側でAPI-304取得 */
export default async function RunClearPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <ClearScreen />;
}
