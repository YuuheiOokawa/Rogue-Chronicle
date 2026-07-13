'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type { PlayerResponse } from '@/types/api';

/** SCR-102 プレイヤープロフィール画面（docs/09 §5.2。表示名変更はMVP外・表示のみ） */
export function ProfileScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['player'],
    queryFn: () => apiGet<PlayerResponse>('/api/v1/player'),
  });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 py-6">
      <PageHeader title="プロフィール" backHref="/home" />

      {isPending ? (
        <>
          <SkeletonBlock className="h-28 w-full" />
          <SkeletonBlock className="h-40 w-full" />
        </>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-lg bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{data.displayName}</p>
              <span className="text-xs text-content-muted">
                {data.isGuest ? 'ゲスト' : '正式アカウント'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Rank {data.rank}</span>
              <div
                role="progressbar"
                aria-label="ランクEXP"
                aria-valuenow={data.rankExp}
                aria-valuemin={0}
                aria-valuemax={data.nextRankExp}
                className="h-3 flex-1 overflow-hidden rounded-full bg-surface-base"
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${data.nextRankExp > 0 ? Math.min(data.rankExp / data.nextRankExp, 1) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-content-muted">
                {data.rankExp} / {data.nextRankExp}
              </span>
            </div>
            <p className="text-xs text-content-muted">
              表示名の変更は今後のアップデートで対応予定です
            </p>
          </section>

          <section aria-label="累計統計" className="grid grid-cols-2 gap-3 text-sm">
            <StatCard label="累計ラン" value={`${data.stats.totalRuns} 回`} />
            <StatCard label="クリア" value={`${data.stats.totalClears} 回`} />
            <StatCard label="最深階層" value={`階層 ${data.stats.bestFloor}`} />
            <StatCard label="累計撃破" value={`${data.stats.totalKills} 体`} />
            <StatCard
              label="実績"
              value={`${data.unlockedAchievements} / ${data.totalAchievements}`}
            />
          </section>

          {data.isGuest ? (
            <Link
              href="/transfer"
              className="rounded-lg border border-accent-gold/60 bg-surface-raised p-4 text-sm"
            >
              <span className="font-semibold text-accent-gold">アカウント登録で引き継ぎ可能</span>
              <br />
              メールアドレスを登録するとデータを他の端末でも使えます →
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4">
      <span className="text-xs text-content-muted">{props.label}</span>
      <span className="text-base font-bold">{props.value}</span>
    </div>
  );
}
