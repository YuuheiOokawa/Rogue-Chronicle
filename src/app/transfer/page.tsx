import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { TransferForm } from '@/features/auth/transfer-form';

/**
 * SCR-006 データ引き継ぎ画面（docs/09 §5.1 / docs/14 §4）。
 * ゲストユーザーへメールアドレス+パスワードを付与して正式アカウント化する。
 */
export default async function TransferPage() {
  const session = await auth();
  if (!session?.userId) redirect('/login');

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-bold">データ引き継ぎ設定</h1>
      <p className="text-sm text-content-muted">
        メールアドレスとパスワードを登録すると、端末を変えてもこのデータで遊べるようになります。
        ゲームの進行データはそのまま引き継がれます。
      </p>
      {session.isGuest ? (
        <TransferForm />
      ) : (
        <p className="rounded-lg bg-surface-raised p-4 text-sm">
          このアカウントは引き継ぎ設定済みです。
        </p>
      )}
      <p className="text-sm">
        <Link href="/home" className="text-primary underline">
          ホームへ戻る
        </Link>
      </p>
    </main>
  );
}
