import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { TitleActions } from '@/features/auth/title-actions';

/**
 * SCR-002 タイトル画面（docs/09_Screen_Design.md §4.1）。
 * ログイン済みならホームへ（再訪時の導線短縮）。
 */
export default async function TitlePage() {
  const session = await auth();
  if (session?.userId) {
    redirect('/home');
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-between px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm tracking-[0.3em] text-content-muted">ROGUELITE RPG</p>
        <h1 className="text-4xl font-bold tracking-wide text-accent-gold">Rogue Chronicle</h1>
        <p className="max-w-[36ch] text-sm leading-relaxed text-content-muted">
          挑戦するたびに姿を変えるダンジョン。
          敗北してもあなたの記録（クロニクル）は残り、次の挑戦を強くする。
        </p>
      </div>
      <TitleActions />
    </main>
  );
}
