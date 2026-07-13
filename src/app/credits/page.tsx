import { PageHeader } from '@/components/page-header';

/** SCR-118 クレジット画面（docs/09 §5.2。静的コンテンツ） */
const LIBRARIES = [
  'Next.js / React（MIT License）',
  'Tailwind CSS（MIT License）',
  'Prisma（Apache License 2.0）',
  'Auth.js / NextAuth.js（ISC License）',
  'TanStack Query（MIT License）',
  'Zustand（MIT License）',
  'Zod（MIT License）',
  'React Hook Form（MIT License）',
  'Framer Motion（MIT License）',
  'bcryptjs（BSD 3-Clause License）',
  'uuid（MIT License）',
];

export default function CreditsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-6 py-6">
      <PageHeader title="クレジット" backHref="/settings" />

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4 text-sm">
        <h2 className="font-bold">Rogue Chronicle</h2>
        <p className="text-content-muted">企画・開発・デザイン: Rogue Chronicle 開発チーム</p>
        <p className="text-xs text-content-muted">バージョン 0.1.0</p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4 text-sm">
        <h2 className="font-bold">使用ライブラリ</h2>
        <ul className="flex flex-col gap-1 text-content-muted">
          {LIBRARIES.map((lib) => (
            <li key={lib}>・{lib}</li>
          ))}
        </ul>
        <p className="pt-2 text-xs text-content-muted">
          各ライブラリのライセンス全文は配布元リポジトリを参照してください。
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4 text-sm">
        <h2 className="font-bold">素材</h2>
        <p className="text-content-muted">アイコン・絵文字はシステム標準のものを使用しています。</p>
      </section>
    </main>
  );
}
