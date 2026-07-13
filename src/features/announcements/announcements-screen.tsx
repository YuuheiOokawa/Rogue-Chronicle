'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type { AnnouncementsResponse } from '@/types/api';

const CATEGORY_LABELS: Record<string, string> = {
  update: '更新',
  maintenance: 'メンテ',
  event: 'イベント',
};

/** SCR-115 お知らせ画面（docs/09 §5.2。アコーディオン展開） */
export function AnnouncementsScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => apiGet<AnnouncementsResponse>('/api/v1/announcements'),
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-6 py-6">
      <PageHeader title="お知らせ" backHref="/home" />

      {isPending ? (
        <>
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <p className="rounded-lg bg-surface-raised p-6 text-center text-sm text-content-muted">
          お知らせはありません
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <li key={item.id} className="rounded-lg bg-surface-raised">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex min-h-11 w-full flex-col gap-1 p-4 text-left"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    <span className="flex-1 truncate text-sm font-semibold">{item.title}</span>
                    <span aria-hidden className="text-xs text-content-muted">
                      {expanded ? '▲' : '▼'}
                    </span>
                  </div>
                  <span className="text-xs text-content-muted">
                    {new Date(item.publishedAt).toLocaleDateString('ja-JP')}
                  </span>
                </button>
                {expanded ? (
                  <p className="border-t border-surface-base px-4 py-3 text-sm whitespace-pre-wrap text-content-muted">
                    {item.body}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
