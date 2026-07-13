'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError, FormField, SubmitButton, usePending } from '@/components/auth-form';
import { linkGuestSchema } from '@/schemas/auth';

/** SCR-006 引き継ぎフォーム（API-006 → 再ログインでセッションのisGuestを更新） */
export function TransferForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, run] = usePending();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      setFieldErrors({});

      const parsed = linkGuestSchema.safeParse({ email, password });
      if (!parsed.success) {
        const fe: Record<string, string> = {};
        for (const issue of parsed.error.issues) fe[issue.path.join('.')] = issue.message;
        setFieldErrors(fe);
        return;
      }

      const res = await fetch('/api/v1/auth/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          details?: { path: string; message: string }[];
        } | null;
        if (body?.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of body.details) fe[d.path] = d.message;
          setFieldErrors(fe);
        }
        setError(body?.message ?? '引き継ぎ設定に失敗しました。');
        return;
      }

      // セッションJWTのisGuestを更新するため再ログイン（docs: API-006 実装注意）
      await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
      router.push('/home');
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormField
        label="メールアドレス"
        type="email"
        name="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={fieldErrors.email}
      />
      <FormField
        label="パスワード（8文字以上・英字と数字を含む）"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <SubmitButton label="引き継ぎ設定する" pending={pending} />
    </form>
  );
}
