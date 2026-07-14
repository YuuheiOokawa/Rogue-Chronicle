import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { RetireConfirmScreen } from '@/features/result/retire-confirm-screen';

/** SCR-314 リタイア確認画面（docs/09 §5.4）。表示データはクライアント側でAPI-304取得 */
export default async function RunRetirePage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <RetireConfirmScreen />;
}
