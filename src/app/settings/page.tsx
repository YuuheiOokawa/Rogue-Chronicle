import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { SettingsScreen } from '@/features/settings/settings-screen';

/** SCR-116 設定画面（docs/09 §4.13） */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <SettingsScreen isGuest={session.isGuest} />;
}
