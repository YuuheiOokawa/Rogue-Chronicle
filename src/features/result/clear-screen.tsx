'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ErrorPanel, SkeletonBlock } from '@/components/query-states';

import { isNotFound, useRunCurrentQuery } from './run-current-query';

/**
 * SCR-401 クリア画面（docs/09 §5.5）。
 * ボス撃破直後の勝利演出のみを担う前段画面。報酬確定はSCR-403（API-307 finalize）に集約される
 * （docs/09 SCR-403備考）。表示条件はdungeon_runs.status==='cleared'をこの画面自身がGET
 * /api/v1/runs/current（API-304）で確認する（遷移元の配線には依存しない設計）。
 */
export function ClearScreen() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useRunCurrentQuery();

  useEffect(() => {
    if (isError && isNotFound(error)) {
      router.replace('/home');
      return;
    }
    if (data && data.status !== 'cleared') {
      // クリア以外（failed/retired等）で本画面に来た場合はリザルトへ直行する
      router.replace('/run/result');
    }
  }, [data, isError, error, router]);

  if (isPending) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-64 w-full" />
      </main>
    );
  }
  if (isError && !isNotFound(error)) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-6">
        <ErrorPanel onRetry={() => void refetch()} />
      </main>
    );
  }
  if (!data || data.status !== 'cleared') {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-6 px-4 py-6 text-center">
      <h1 className="text-3xl font-extrabold text-accent-gold">✦ RESULT ✦</h1>
      <p className="text-2xl font-bold text-accent-gold">🏆 ダンジョンクリア！</p>
      <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-5 text-sm text-content-muted">
        <p>到達階層: {data.position.floor}</p>
        <p>最終レベル: Lv{data.character.level}</p>
        <p>撃破数: {data.earned.kills}</p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/run/result')}
        className="flex h-12 w-full max-w-[280px] items-center justify-center rounded-lg bg-primary font-semibold text-white"
      >
        リザルトへ
      </button>
    </main>
  );
}
