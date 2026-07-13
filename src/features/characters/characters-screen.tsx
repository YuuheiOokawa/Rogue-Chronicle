'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { BottomNav } from '@/components/bottom-nav';
import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type { CharacterListItem, CharactersResponse, UnlockConditionView } from '@/types/api';

import { elementText } from './labels';

/** SCR-104 キャラクター一覧画面（docs/09 §5.2。未解放はシルエット風+解放条件） */
export function CharactersScreen() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['characters'],
    queryFn: () => apiGet<CharactersResponse>('/api/v1/characters'),
  });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 pt-6 pb-24">
      <PageHeader title="キャラクター" backHref="/home" />

      {isPending ? (
        <div className="grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-44" />
          <SkeletonBlock className="h-44" />
          <SkeletonBlock className="h-44" />
        </div>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {data.items.map((item) => (
            <li key={item.code}>
              <CharacterCard item={item} />
            </li>
          ))}
        </ul>
      )}
      <BottomNav current="characters" />
    </main>
  );
}

function CharacterCard({ item }: { item: CharacterListItem }) {
  return (
    <Link
      href={`/characters/${item.code}`}
      className={`flex min-h-44 flex-col gap-2 rounded-lg bg-surface-raised p-4 transition-opacity hover:opacity-90 ${
        item.unlocked ? '' : 'border border-surface-raised'
      }`}
    >
      <div
        aria-hidden
        className={`flex h-16 items-center justify-center rounded-lg text-4xl ${
          item.unlocked ? 'bg-surface-base' : 'bg-surface-base/60 grayscale'
        }`}
      >
        {item.unlocked ? '🛡' : '👤'}
      </div>
      <p className={`font-bold ${item.unlocked ? '' : 'text-content-muted'}`}>
        {item.name}
        {item.unlocked ? null : (
          <span aria-label="未解放" className="ml-1 text-sm">
            🔒
          </span>
        )}
      </p>
      {item.unlocked ? (
        <>
          <p className="text-xs text-content-muted">{item.type}</p>
          <p className="text-xs">{elementText(item.element)}</p>
        </>
      ) : (
        <UnlockConditionLine condition={item.unlockCondition} />
      )}
    </Link>
  );
}

function UnlockConditionLine({ condition }: { condition: UnlockConditionView | null }) {
  if (!condition) return null;
  if (condition.type === 'shards') {
    return (
      <p className="text-xs text-content-muted">
        💎{condition.requiredShards.toLocaleString()}で解放
        {condition.canUnlock ? (
          <span className="ml-1 rounded bg-accent-gold/20 px-1 font-semibold text-accent-gold">
            解放可能
          </span>
        ) : null}
      </p>
    );
  }
  return (
    <p className="text-xs text-content-muted">
      実績「{condition.achievementName}」で解放（{Math.min(condition.progress, condition.goal)}/
      {condition.goal}）
    </p>
  );
}
