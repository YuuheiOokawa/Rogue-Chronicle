'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiSend, ApiClientError } from '@/lib/api-client';

import { isNotFound, useRunCurrentQuery } from './run-current-query';

interface FinalizeResponse {
  finalStatus: 'cleared' | 'failed' | 'retired';
  runStatus: 'finalized';
  reachedFloor: number;
  soulShards: { granted: number; balance: number };
  rank: { before: number; after: number; rankExp: number; rankUps: number };
  stats: {
    kills: number;
    eliteKills: number;
    totalRuns: number;
    totalClears: number;
    totalDefeats: number;
    totalKills: number;
    bestFloor: number;
  };
  newCodexEntries: { entryType: string; entryCode: string }[];
  unlockedAchievements: { code: string; name: string }[];
  unlockedCharacters: { code: string; name: string }[];
  version: number;
}

const FINAL_STATUS_LABEL: Record<FinalizeResponse['finalStatus'], string> = {
  cleared: '🏆 ダンジョンクリア！',
  failed: '冒険は終了しました',
  retired: '撤退した',
};

/**
 * SCR-403 リザルト画面（docs/09 §4.10。SCR-404報酬獲得画面を統合）。
 * 表示条件はdungeon_runs.status IN (cleared/failed/retired) をGET /api/v1/runs/current
 * （API-304）で確認し、確認できたら画面表示と同時にAPI-307（finalize）を自動実行する
 * （二重実行防止: Idempotency-Keyをrefで保持しmutate呼び出しは1回のみに制限）。
 */
export function ResultScreen() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useRunCurrentQuery();
  const idempotencyKeyRef = useRef<string | null>(null);
  const triggeredRef = useRef(false);

  const finalizeMutation = useMutation({
    mutationFn: (version: number) => {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      return apiSend<FinalizeResponse>('/api/v1/runs/current/finalize', {
        method: 'POST',
        body: { version },
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
      });
    },
  });

  useEffect(() => {
    if (isError && isNotFound(error)) {
      // finalize済み（API-304の対象外。run-current-query.tsコメント参照）またはランなし
      router.replace('/home');
      return;
    }
    if (!data) return;
    if (data.status === 'active') {
      router.replace('/run/map');
      return;
    }
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      finalizeMutation.mutate(data.version);
    }
    // finalizeMutationはuseMutationの安定した参照ではないため依存配列から意図的に除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isError, error, router]);

  const retryWithFreshKey = () => {
    idempotencyKeyRef.current = null; // versionが変わるため新しいIdempotency-Keyを発行する
    triggeredRef.current = false;
    void refetch();
  };

  if (isPending) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-48 w-full" />
      </main>
    );
  }
  if (isError) {
    if (isNotFound(error)) return null; // リダイレクト中
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-6">
        <ErrorPanel onRetry={() => void refetch()} />
      </main>
    );
  }
  if (!data || data.status === 'active') {
    return null; // リダイレクト中
  }

  if (finalizeMutation.status === 'idle' || finalizeMutation.isPending) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-48 w-full" />
        <p role="status" className="text-center text-sm text-content-muted">
          報酬を計算中…
        </p>
      </main>
    );
  }

  if (finalizeMutation.isError) {
    const err = finalizeMutation.error;
    if (err instanceof ApiClientError && err.errorCode === 'ERR_REWARD_ALREADY_CLAIMED') {
      // 正常系扱い（docs/09 SCR-403エラー表示）: 受領済み値の再表示はAPI-304が対象外のため省略
      return (
        <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-4 px-4 py-6 text-center">
          <p className="text-lg font-semibold">この報酬は受け取り済みです</p>
          <p className="text-sm text-content-muted">最新の状況はホーム画面でご確認ください。</p>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="flex h-12 w-full max-w-[280px] items-center justify-center rounded-lg bg-primary font-semibold text-white"
          >
            ホームへ戻る
          </button>
        </main>
      );
    }
    if (err instanceof ApiClientError && err.errorCode === 'ERR_CONFLICT_VERSION') {
      return (
        <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-6">
          <ErrorPanel
            message="データが更新されていました。再読み込みしてお試しください。"
            onRetry={retryWithFreshKey}
          />
        </main>
      );
    }
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-6">
        <ErrorPanel
          message={err instanceof ApiClientError ? err.message : undefined}
          onRetry={() => finalizeMutation.mutate(data.version)}
        />
        {/* 報酬未確定のままホームへ戻さない（docs/09 SCR-403エラー表示） */}
      </main>
    );
  }

  const result = finalizeMutation.data;
  if (!result) return null;

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-extrabold text-accent-gold">✦ RESULT ✦</h1>
        <p className="mt-1 text-lg font-bold">{FINAL_STATUS_LABEL[result.finalStatus]}</p>
        <p className="text-sm text-content-muted">到達階層: {result.reachedFloor}</p>
      </header>

      <section aria-label="獲得報酬" className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-content-muted">獲得報酬</h2>
        <div className="flex items-center justify-between">
          <span>💎 ソウルシャード</span>
          <span className="font-semibold text-accent-gold">+{result.soulShards.granted}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-content-muted">
          <span>残高</span>
          <span>{result.soulShards.balance}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>⭐ ランク</span>
          <span className="font-semibold">
            Rank{result.rank.before}
            {result.rank.rankUps > 0 ? ` → Rank${result.rank.after}！` : ''}
          </span>
        </div>
      </section>

      <section aria-label="統計" className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-content-muted">統計</h2>
        <p>
          撃破数 {result.stats.kills}（うちエリート {result.stats.eliteKills}）
        </p>
        <p>
          累計ラン {result.stats.totalRuns} / クリア {result.stats.totalClears} / 敗北{' '}
          {result.stats.totalDefeats}
        </p>
        <p>最深到達階層 {result.stats.bestFloor}</p>
      </section>

      {result.newCodexEntries.length > 0 ? (
        <section
          aria-label="図鑑登録"
          className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4 text-sm"
        >
          <h2 className="mb-1 text-sm font-semibold text-content-muted">
            図鑑登録 NEW {result.newCodexEntries.length}件
          </h2>
          <p className="text-content-muted">
            {result.newCodexEntries.map((e) => e.entryCode).join(' / ')}
          </p>
        </section>
      ) : null}

      {result.unlockedAchievements.length > 0 ? (
        <section
          aria-label="実績解除"
          className="flex flex-col gap-1 rounded-lg border border-accent-gold/60 bg-surface-raised p-4 text-sm"
        >
          <h2 className="mb-1 text-sm font-semibold text-accent-gold">実績解除</h2>
          {result.unlockedAchievements.map((a) => (
            <p key={a.code}>🏆 {a.name}</p>
          ))}
        </section>
      ) : null}

      {result.unlockedCharacters.length > 0 ? (
        <section
          aria-label="新規解放キャラクター"
          className="flex flex-col gap-1 rounded-lg border border-accent-gold/60 bg-surface-raised p-4 text-sm"
        >
          <h2 className="mb-1 text-sm font-semibold text-accent-gold">新規解放キャラクター</h2>
          {result.unlockedCharacters.map((c) => (
            <p key={c.code}>✨ {c.name}</p>
          ))}
        </section>
      ) : null}

      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white"
        >
          ホームへ戻る
        </button>
        <button
          type="button"
          onClick={() => router.push('/dungeons')}
          className="flex h-11 w-full items-center justify-center rounded-lg border border-primary/60 text-sm font-semibold text-primary"
        >
          もう一度挑戦する
        </button>
      </div>
    </main>
  );
}
