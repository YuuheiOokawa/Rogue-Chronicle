import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { LoginForm } from '@/features/auth/login-form';

/** SCR-003 ログイン画面（docs/09 §5.1） */
export default async function LoginPage() {
  const session = await auth();
  if (session?.userId) redirect('/home');

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <LoginForm />
      <div className="flex flex-col gap-2 text-sm text-content-muted">
        <p>
          アカウントをお持ちでない方は{' '}
          <Link href="/register" className="text-primary underline">
            新規登録
          </Link>
        </p>
        <p>
          <Link href="/" className="underline">
            タイトルへ戻る
          </Link>
        </p>
        <p className="text-xs">
          パスワードをお忘れの場合の再設定機能は準備中です（お問い合わせで対応します）。
        </p>
      </div>
    </main>
  );
}
