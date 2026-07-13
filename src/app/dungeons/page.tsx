import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { prisma } from '@/server/services/prisma';

/** SCR-201 ダンジョン一覧画面（docs/09 §4.3） */
export default async function DungeonsPage() {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const [progress, activeRun] = await Promise.all([
    prisma.playerProgress.findUnique({ where: { userId: session.userId } }),
    prisma.dungeonRun.findFirst({
      where: { userId: session.userId, status: 'active' },
      select: { id: true },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダンジョン</h1>
        <Link href="/home" className="text-sm text-content-muted underline">
          ホームへ
        </Link>
      </header>

      {activeRun ? (
        <Link
          href="/run/map"
          className="rounded-lg border border-accent-gold/60 bg-surface-raised p-4 text-sm"
        >
          <span className="font-semibold text-accent-gold">進行中の冒険があります</span>
          <br />
          続きから再開する →
        </Link>
      ) : null}

      <div className="flex flex-col gap-4">
        {DUNGEONS.map((d) => (
          <Link
            key={d.code}
            href={`/dungeons/${d.code}`}
            className="flex flex-col gap-2 rounded-lg bg-surface-raised p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{d.name}</span>
              <span className="text-xs text-content-muted">全{d.floors}階層</span>
            </div>
            <p className="text-sm leading-relaxed text-content-muted">{d.description}</p>
            <p className="text-xs text-content-muted">
              最深到達: {progress?.bestFloor ?? 0}階層 / クリア {progress?.totalClears ?? 0}回
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
