'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authErrorMessage, FormError, usePending } from '@/components/auth-form';

/**
 * SCR-002 タイトル画面の操作部（docs/09 §4.1）。
 * - はじめる（ゲスト）: signIn('guest') → /home（API-005相当）
 * - ログイン: /login へ
 */
export function TitleActions() {
  const router = useRouter();
  const [pending, run] = usePending();
  const [error, setError] = useState<string | null>(null);

  const startGuest = () =>
    run(async () => {
      setError(null);
      const res = await signIn('guest', { redirect: false });
      if (res?.error) {
        setError(authErrorMessage(res.code));
        return;
      }
      router.push('/home');
      router.refresh();
    });

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <FormError message={error} />
      <button
        type="button"
        onClick={startGuest}
        disabled={pending}
        className="h-12 w-full rounded-lg bg-primary font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {pending ? '準備中…' : 'はじめる（登録不要）'}
      </button>
      <button
        type="button"
        onClick={() => router.push('/login')}
        disabled={pending}
        className="h-12 w-full rounded-lg border border-primary/60 font-semibold text-primary disabled:opacity-50"
      >
        ログイン / データ引き継ぎ
      </button>
      <p className="text-xs text-content-muted">
        はじめると
        <a href="/terms" className="underline">
          利用規約
        </a>
        と
        <a href="/privacy" className="underline">
          プライバシーポリシー
        </a>
        に同意したものとみなされます
      </p>
    </div>
  );
}
