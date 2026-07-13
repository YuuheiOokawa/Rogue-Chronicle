'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  authErrorMessage,
  FormError,
  FormField,
  SubmitButton,
  usePending,
} from '@/components/auth-form';
import { loginSchema } from '@/schemas/auth';

/** SCR-003 ログインフォーム（API-002はAuth.js signIn('credentials')で実現） */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = usePending();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setError('メールアドレスとパスワードを入力してください');
        return;
      }
      const res = await signIn('credentials', { ...parsed.data, redirect: false });
      if (res?.error) {
        setError(authErrorMessage(res.code));
        return;
      }
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
      />
      <FormField
        label="パスワード"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <SubmitButton label="ログイン" pending={pending} />
    </form>
  );
}
