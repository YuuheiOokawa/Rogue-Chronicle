'use client';

/** GET系初期表示のスケルトン（docs/09 §2.3） */
export function SkeletonBlock(props: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-surface-raised ${props.className ?? 'h-20 w-full'}`}
    />
  );
}

/** 読み込み失敗時の再試行パネル（docs/09 §2.4） */
export function ErrorPanel(props: { message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg bg-surface-raised p-6">
      <p className="text-sm text-content-muted">
        {props.message ?? 'データの取得に失敗しました。'}
      </p>
      <button
        type="button"
        onClick={props.onRetry}
        className="h-11 rounded-lg border border-primary/60 px-6 text-sm font-semibold text-primary"
      >
        再試行
      </button>
    </div>
  );
}
