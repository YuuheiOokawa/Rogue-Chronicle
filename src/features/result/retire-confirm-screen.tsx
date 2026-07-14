'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormError, usePending } from '@/components/auth-form';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiSend, ApiClientError } from '@/lib/api-client';

import { isNotFound, useRunCurrentQuery } from './run-current-query';

const PAYOUT_RATE = 0.8; // DEC-025: リタイアはphase不問で常に80%

interface RetireResponse {
  retired: true;
  reachedFloor: number;
  earned: { soulShards: number; rankExp: number; kills: number; eliteKills: number };
  version: number;
}

/**
 * SCR-314 リタイア確認画面（docs/09 §5.4）。
 * DEC-025: 獲得予定ソウルシャードは現在のphase（map_select/battle/reward_pending）によらず一律80%。
 * 確定→API-306（retire）→SCR-403（/run/result）。二重送信防止: 冪等キー+ボタンdisabled。
 */
export function RetireConfirmScreen() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useRunCurrentQuery();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, run] = usePending();

  useEffect(() => {
    if (isError && isNotFound(error)) {
      router.replace('/home');
      return;
    }
    if (data && data.status !== 'active') {
      // 既に終了済みのランはリザルトへ（このランはもうリタイアできない）
      router.replace('/run/result');
    }
  }, [data, isError, error, router]);

  if (isPending) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-48 w-full" />
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
  if (!data || data.status !== 'active') {
    return null;
  }

  const payoutPreview = Math.floor(data.earned.soulShards * PAYOUT_RATE);

  const confirmRetire = () =>
    run(async () => {
      setFormError(null);
      const ok = window.confirm(
        '本当にリタイアしますか？\nこの操作は取り消せません。獲得中の資産は80%のみ持ち帰れます。',
      );
      if (!ok) return;
      try {
        const res = await apiSend<RetireResponse>('/api/v1/runs/current/retire', {
          method: 'POST',
          body: { version: data.version },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        });
        void res;
        router.push('/run/result');
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.errorCode === 'ERR_CONFLICT_VERSION' || err.errorCode === 'ERR_RUN_STATE_INVALID') {
            await refetch();
            setFormError('データが更新されていたため、最新の状態に同期しました。もう一度お試しください。');
            return;
          }
          setFormError(err.message);
          return;
        }
        setFormError('通信に失敗しました。時間をおいてお試しください。');
      }
    });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-6 px-4 py-6">
      <h1 className="text-center text-xl font-bold">リタイアしますか？</h1>
      <p className="text-center text-sm text-content-muted">
        冒険を中断します。獲得済みの資産は現在のphaseによらず一律80%を持ち帰れます。
      </p>
      <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-5 text-sm">
        <div className="flex justify-between">
          <span className="text-content-muted">到達階層</span>
          <span>{data.position.floor}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-muted">獲得予定ソウルシャード（80%）</span>
          <span className="font-semibold text-accent-gold">{payoutPreview}</span>
        </div>
      </div>

      <FormError message={formError} />

      <button
        type="button"
        disabled={pending}
        onClick={confirmRetire}
        className="h-12 rounded-lg bg-damage font-semibold text-white disabled:opacity-50"
      >
        リタイアする
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => router.push('/run/map')}
        className="h-11 rounded-lg border border-surface-raised text-sm text-content-muted disabled:opacity-50"
      >
        やめる
      </button>
    </main>
  );
}
