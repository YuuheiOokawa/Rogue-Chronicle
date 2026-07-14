import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DefeatScreen } from '@/features/result/defeat-screen';

/** SCR-402 敗北画面（docs/09 §5.5）。表示データはクライアント側でAPI-304取得 */
export default async function RunDefeatPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <DefeatScreen />;
}
