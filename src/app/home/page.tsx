import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { LogoutButton } from '@/features/auth/logout-button';
import { prisma } from '@/server/services/prisma';

/**
 * SCR-101 ホーム画面（Phase 2時点の仮実装）。
 * 本実装（出撃導線・お知らせ・ミッション等）は Phase 4（docs/09 §4.2）。
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { profile: true, progress: true, currencies: true },
  });
  if (!user || user.status !== 'active') redirect('/');

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">{user.profile?.displayName ?? '冒険者'}</p>
          <p className="text-sm text-content-muted">
            ランク {user.progress?.rank ?? 1} ・ ソウルシャード{' '}
            <span className="text-accent-gold">{user.currencies?.soulShards ?? 0}</span>
          </p>
        </div>
        <LogoutButton />
      </header>

      {user.isGuest ? (
        <Link
          href="/transfer"
          className="rounded-lg border border-accent-gold/60 bg-surface-raised p-4 text-sm"
        >
          <span className="font-semibold text-accent-gold">ゲストプレイ中</span>
          <br />
          端末を変えてもデータを使えるように、引き継ぎ設定をおすすめします →
        </Link>
      ) : null}

      <section className="flex flex-col gap-3">
        <button
          type="button"
          disabled
          className="h-14 w-full rounded-lg bg-primary text-lg font-bold text-white opacity-50"
        >
          ダンジョンへ挑戦（Phase 5で実装）
        </button>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-surface-raised p-4 text-content-muted">
            キャラクター（Phase 4）
          </div>
          <div className="rounded-lg bg-surface-raised p-4 text-content-muted">
            永続強化（Phase 8）
          </div>
          <div className="rounded-lg bg-surface-raised p-4 text-content-muted">図鑑（Phase 8）</div>
          <div className="rounded-lg bg-surface-raised p-4 text-content-muted">実績（Phase 8）</div>
        </div>
      </section>

      <footer className="mt-auto flex flex-col gap-1 text-xs text-content-muted">
        <p>
          累計ラン {user.progress?.totalRuns ?? 0} 回 / クリア {user.progress?.totalClears ?? 0} 回
        </p>
        <p>
          <Link href="/terms" className="underline">
            利用規約
          </Link>{' '}
          ・{' '}
          <Link href="/privacy" className="underline">
            プライバシーポリシー
          </Link>
        </p>
      </footer>
    </main>
  );
}
