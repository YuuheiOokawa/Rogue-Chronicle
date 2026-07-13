import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CharactersScreen } from '@/features/characters/characters-screen';

/** SCR-104 キャラクター一覧画面（docs/09 §5.2） */
export default async function CharactersPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  return <CharactersScreen />;
}
