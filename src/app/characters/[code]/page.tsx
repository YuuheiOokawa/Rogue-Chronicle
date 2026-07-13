import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CharacterDetailScreen } from '@/features/characters/character-detail-screen';

/** SCR-105 キャラクター詳細画面（docs/09 §4.12） */
export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const { code } = await params;
  return <CharacterDetailScreen code={code} />;
}
