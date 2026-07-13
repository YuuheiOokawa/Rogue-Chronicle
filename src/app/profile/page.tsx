import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ProfileScreen } from '@/features/player/profile-screen';

/** SCR-102 プレイヤープロフィール画面（docs/09 §5.2） */
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <ProfileScreen />;
}
