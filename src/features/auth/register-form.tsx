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
import { registerSchema } from '@/schemas/auth';

/** SCR-004 新規登録フォーム（API-001 → signIn('credentials')） */
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, run] = usePending();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      setFieldErrors({});

      const parsed = registerSchema.safeParse({
        email,
        password,
        displayName: displayName || undefined,
      });
      if (!parsed.success) {
        const fe: Record<string, string> = {};
        for (const issue of parsed.error.issues) fe[issue.path.join('.')] = issue.message;
        setFieldErrors(fe);
        return;
      }

      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          errorCode?: string;
          message?: string;
          details?: { path: string; message: string }[];
        } | null;
        if (body?.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of body.details) fe[d.path] = d.message;
          setFieldErrors(fe);
        }
        setError(body?.message ?? '登録に失敗しました。時間をおいてお試しください。');
        return;
      }

      // 登録成功 → そのままログイン（API-002相当）
      const login = await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
      if (login?.error) {
        setError(authErrorMessage(login.code));
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
      <FormField
        label="表示名（12文字以内・省略可）"
        type="text"
        name="displayName"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="nickname"
        error={fieldErrors.displayName}
      />
      <SubmitButton label="登録してはじめる" pending={pending} />
    </form>
  );
}
