import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AchievementScreen } from '@/features/achievement/achievement-screen';

/** SCR-111 実績一覧画面（docs/09 §4.12） */
export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <AchievementScreen />;
}
