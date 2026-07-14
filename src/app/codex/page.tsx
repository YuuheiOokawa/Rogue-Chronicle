import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CodexScreen } from '@/features/codex/codex-screen';

/**
 * SCR-107/108/109/110 図鑑・武器一覧統合画面（docs/09 §4.12、docs/29 DEC-290）。
 */
export default async function CodexPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <CodexScreen />;
}
