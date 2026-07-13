import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DUNGEON_NODE_TYPES, DUNGEONS } from '@/constants/masters/dungeons';

/** SCR-202 ダンジョン詳細画面（SCR-203 難易度選択を統合。docs/09 §5.3） */
export default async function DungeonDetailPage({
  params,
}: {
  params: Promise<{ dungeonCode: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const { dungeonCode } = await params;
  const dungeon = DUNGEONS.find((d) => d.code === dungeonCode);
  if (!dungeon) notFound();

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <Link href="/dungeons" className="text-sm text-content-muted underline">
          ← ダンジョン一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-accent-gold">{dungeon.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">{dungeon.description}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-content-muted">難易度</h2>
        {dungeon.difficulties.map((diff) => (
          <div
            key={diff.code}
            className="flex items-center justify-between rounded-lg bg-surface-raised px-4 py-3"
          >
            <span className="font-semibold">{diff.name}</span>
            <span className="text-xs text-content-muted">全{dungeon.floors}階層</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg bg-surface-raised/50 px-4 py-3 text-content-muted">
          <span>ハード</span>
          <span className="text-xs">？？？（将来解放）</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-content-muted">出現するマス</h2>
        <div className="grid grid-cols-2 gap-2">
          {DUNGEON_NODE_TYPES.map((t) => (
            <div key={t.code} className="rounded-lg bg-surface-raised px-3 py-2 text-xs">
              <span className="font-semibold">{t.name}</span>
            </div>
          ))}
        </div>
      </section>

      <Link
        href={`/dungeons/${dungeon.code}/prepare`}
        className="mt-auto flex h-14 w-full items-center justify-center rounded-lg bg-primary text-lg font-bold text-white"
      >
        挑戦する
      </Link>
    </main>
  );
}
