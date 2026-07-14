'use client';

import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type {
  AchievementListItem,
  AchievementsResponse,
} from '@/server/usecases/achievement/achievement-view';

/**
 * SCR-111 実績一覧画面（docs/09 §4.12）。
 * 実績10個（MVP）の達成状況・進捗バー・達成日時を一覧表示する。未解除でも説明文は表示する
 * （docs/09 SCR-111節: 「本画面は表示のみで受領操作なし」＝実績解除自体はAPI-307 finalize時のサーバー判定）。
 */
export function AchievementScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => apiGet<AchievementsResponse>('/api/v1/achievements'),
  });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 pt-6 pb-10">
      <PageHeader title="実績" backHref="/home" />

      {isPending ? (
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <li key={item.code}>
              <AchievementCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function AchievementCard({ item }: { item: AchievementListItem }) {
  const ratio = item.goal > 0 ? Math.min(item.progress / item.goal, 1) : item.unlocked ? 1 : 0;
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg bg-surface-raised p-4 ${
        item.unlocked ? 'border border-accent-gold/60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl">
            {item.unlocked ? '🏆' : '🔒'}
          </span>
          <p className={`font-bold ${item.unlocked ? '' : 'text-content-muted'}`}>{item.name}</p>
        </div>
        {item.unlocked && item.unlockedAt ? (
          <p className="shrink-0 text-xs text-content-muted">
            {new Date(item.unlockedAt).toLocaleDateString('ja-JP')}達成
          </p>
        ) : null}
      </div>
      <p className="text-xs text-content-muted">{item.description}</p>
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={Math.min(item.progress, item.goal)}
          aria-valuemin={0}
          aria-valuemax={item.goal}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base"
        >
          <div
            className={`h-full rounded-full ${item.unlocked ? 'bg-accent-gold' : 'bg-primary/70'}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        <p className="shrink-0 text-xs text-content-muted">
          {Math.min(item.progress, item.goal)}/{item.goal}
        </p>
      </div>
    </div>
  );
}
