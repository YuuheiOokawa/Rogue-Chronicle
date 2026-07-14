'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ErrorPanel, SkeletonBlock } from '@/components/query-states';

import { isNotFound, useRunCurrentQuery } from './run-current-query';

/**
 * SCR-402 敗北画面（docs/09 §5.5）。
 * 「失うもの/残るもの」を明示して次回への動機付けを行う演出のみの前段画面
 * （報酬確定はSCR-403/API-307に集約。docs/09 SCR-402備考）。
 * 表示条件はこの画面自身がdungeon_runs.status==='failed'をGET /api/v1/runs/current（API-304）で確認する。
 */
export function DefeatScreen() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useRunCurrentQuery();

  useEffect(() => {
    if (isError && isNotFound(error)) {
      router.replace('/home');
      return;
    }
    if (data && data.status !== 'failed') {
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
  if (!data || data.status !== 'failed') {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-6 px-4 py-6 text-center">
      <h1 className="text-2xl font-bold text-content-muted">敗北…</h1>
      <p className="text-sm text-content-muted">到達階層: {data.position.floor}</p>
      <div className="grid w-full grid-cols-2 gap-3 text-left text-sm">
        <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4">
          <p className="font-semibold text-damage">失うもの</p>
          <p className="text-content-muted">レベル・スキル</p>
          <p className="text-content-muted">装備・ゴールド</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4">
          <p className="font-semibold text-accent-gold">残るもの</p>
          <p className="text-content-muted">ソウルシャード（50%）</p>
          <p className="text-content-muted">ランクEXP・図鑑</p>
        </div>
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
