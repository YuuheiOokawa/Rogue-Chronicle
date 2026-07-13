import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { HomeScreen } from '@/features/home/home-screen';

/** SCR-101 ホーム画面（docs/09 §4.2）。表示データはAPI-101（クライアント側取得） */
export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <HomeScreen />;
}
