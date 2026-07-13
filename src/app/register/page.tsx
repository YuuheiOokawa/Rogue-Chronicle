import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { RegisterForm } from '@/features/auth/register-form';

/** SCR-004 新規登録画面（docs/09 §5.1） */
export default async function RegisterPage() {
  const session = await auth();
  if (session?.userId) redirect('/home');

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-bold">新規登録</h1>
      <p className="text-sm text-content-muted">
        アカウントを作成すると、複数の端末からデータを利用できます。
        まず気軽に試したい方はタイトルの「はじめる（登録不要）」からどうぞ。
      </p>
      <RegisterForm />
      <div className="flex flex-col gap-2 text-sm text-content-muted">
        <p>
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-primary underline">
            ログイン
          </Link>
        </p>
        <p>
          <Link href="/" className="underline">
            タイトルへ戻る
          </Link>
        </p>
      </div>
    </main>
  );
}
