'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { LogoutButton } from '@/features/auth/logout-button';
import { BottomNav } from '@/components/bottom-nav';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type { HomeResponse } from '@/types/api';

/** SCR-101 ホーム画面（docs/09 §4.2）。API-101で実データ表示 */
export function HomeScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiGet<HomeResponse>('/api/v1/home'),
  });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 pt-10 pb-24">
      {isPending ? (
        <>
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="h-40 w-full" />
        </>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <HomeContent data={data} />
      )}
      <BottomNav current="home" />
    </main>
  );
}

function HomeContent({ data }: { data: HomeResponse }) {
  const { player, stats } = data;
  const expRatio = player.nextRankExp > 0 ? Math.min(player.rankExp / player.nextRankExp, 1) : 0;
  const latest = data.latestAnnouncements[0];

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <Link href="/profile" className="group flex min-h-11 flex-1 flex-col gap-1">
          <p className="text-lg font-bold group-hover:underline">
            <span aria-hidden>👤 </span>
            {player.displayName}
          </p>
          <div className="flex items-center gap-2 text-sm text-content-muted">
            <span>Rank {player.rank}</span>
            <div
              role="progressbar"
              aria-label="ランクEXP"
              aria-valuenow={player.rankExp}
              aria-valuemin={0}
              aria-valuemax={player.nextRankExp}
              className="h-2 w-20 overflow-hidden rounded-full bg-surface-raised"
            >
              <div className="h-full bg-primary" style={{ width: `${expRatio * 100}%` }} />
            </div>
            <span>
              <span aria-hidden>💎</span>
              <span className="font-semibold text-accent-gold">
                {player.soulShards.toLocaleString()}
              </span>
            </span>
          </div>
        </Link>
        <LogoutButton />
      </header>

      {player.isGuest ? (
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
        {data.hasActiveRun ? (
          <Link
            href="/dungeons"
            className="rounded-lg border border-primary/60 bg-surface-raised p-4 text-sm"
          >
            <span className="font-semibold text-primary">▶ 進行中の冒険があります</span>
            <br />
            <span className="text-content-muted">ダンジョン画面から再開できます →</span>
          </Link>
        ) : null}

        <Link
          href="/dungeons"
          className="flex h-14 w-full items-center justify-center rounded-lg bg-primary text-lg font-bold text-white transition-opacity hover:opacity-90"
        >
          ⚔ ダンジョンへ挑戦
        </Link>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Link
            href="/characters"
            className="flex min-h-16 items-center rounded-lg bg-surface-raised p-4 font-semibold hover:bg-surface-raised/80"
          >
            🛡 キャラクター
          </Link>
          <DisabledTile label="✦ 永続強化" />
          <DisabledTile label="📖 図鑑" />
          <DisabledTile label="🏆 実績" />
        </div>

        <Link
          href="/announcements"
          className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-raised p-4 text-sm"
        >
          <span aria-hidden>📜</span>
          <span className="truncate text-content-muted">
            {latest ? `お知らせ: ${latest.title}` : 'お知らせはありません'}
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Link
            href="/settings"
            className="flex min-h-11 items-center rounded-lg bg-surface-raised p-3 text-content-muted"
          >
            ⚙ 設定
          </Link>
          <Link
            href="/help"
            className="flex min-h-11 items-center rounded-lg bg-surface-raised p-3 text-content-muted"
          >
            ❓ ヘルプ
          </Link>
        </div>
      </section>

      <footer className="mt-auto flex flex-col gap-1 text-xs text-content-muted">
        <p>
          累計ラン {stats.totalRuns} 回 / クリア {stats.totalClears} 回 / 最深階層 {stats.bestFloor}
        </p>
        <p>
          <Link href="/terms" className="underline">
            利用規約
          </Link>{' '}
          ・{' '}
          <Link href="/privacy" className="underline">
            プライバシーポリシー
          </Link>{' '}
          ・{' '}
          <Link href="/credits" className="underline">
            クレジット
          </Link>
        </p>
      </footer>
    </>
  );
}

function DisabledTile({ label }: { label: string }) {
  return (
    <div
      aria-disabled="true"
      title="Phase 8で実装予定"
      className="flex min-h-16 items-center rounded-lg bg-surface-raised p-4 text-content-muted opacity-50"
    >
      {label}
      <span className="ml-auto text-[10px]">近日</span>
    </div>
  );
}
