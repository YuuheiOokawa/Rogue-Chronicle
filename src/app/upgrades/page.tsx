import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { UpgradeScreen } from '@/features/upgrade/upgrade-screen';

/** SCR-106 永続強化画面（docs/09 §4.11） */
export default async function UpgradesPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <UpgradeScreen />;
}
