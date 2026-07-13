import Link from 'next/link';

/** ホーム系画面の共通ヘッダ（docs/09 §2.2。タップ領域44px+） */
export function PageHeader(props: { title: string; backHref?: string; right?: React.ReactNode }) {
  return (
    <header className="flex min-h-11 items-center gap-2">
      {props.backHref ? (
        <Link
          href={props.backHref}
          aria-label="戻る"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-content-muted hover:bg-surface-raised"
        >
          ←
        </Link>
      ) : null}
      <h1 className="flex-1 truncate text-lg font-bold">{props.title}</h1>
      {props.right}
    </header>
  );
}

/** ソウルシャード所持数の表示（ヘッダ右側用） */
export function ShardBadge(props: { soulShards: number | undefined }) {
  return (
    <span
      className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm"
      aria-label="ソウルシャード所持数"
    >
      <span aria-hidden>💎</span>
      <span className="font-semibold text-accent-gold">
        {props.soulShards !== undefined ? props.soulShards.toLocaleString() : '—'}
      </span>
    </span>
  );
}
