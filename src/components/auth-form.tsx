'use client';

import { useState } from 'react';

/** 認証系フォームの共通スタイル部品（SCR-003/004/006）。shadcn/ui導入までの暫定実装 */

export function FormField(props: {
  label: string;
  type: 'email' | 'password' | 'text';
  name: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1">
      <span className="text-sm text-content-muted">{props.label}</span>
      <input
        type={props.type}
        name={props.name}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        className="h-12 rounded-lg border border-surface-raised bg-surface-raised px-3 text-content outline-none focus:ring-2 focus:ring-primary"
      />
      {props.error ? (
        <span role="alert" className="text-xs text-damage">
          {props.error}
        </span>
      ) : null}
    </label>
  );
}

export function SubmitButton(props: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={props.pending}
      className="h-12 w-full rounded-lg bg-primary font-semibold text-white transition-opacity disabled:opacity-50"
    >
      {props.pending ? '処理中…' : props.label}
    </button>
  );
}

export function FormError(props: { message: string | null }) {
  if (!props.message) return null;
  return (
    <p role="alert" className="rounded-lg bg-damage/10 px-3 py-2 text-sm text-damage">
      {props.message}
    </p>
  );
}

/** AuthAction用の共通state */
export function usePending(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const [pending, setPending] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (pending) return; // 二重送信防止（docs/08 §2）
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };
  return [pending, run];
}

/** Auth.jsのsignInエラーコード → 表示文言（docs/13 エラーコード表） */
export function authErrorMessage(code: string | undefined | null): string {
  switch (code) {
    case 'ERR_AUTH_LOCKED':
      return 'ログイン試行回数の上限に達しました。15分ほど待ってからお試しください。';
    case 'ERR_RATE_LIMITED':
      return 'リクエストが多すぎます。しばらく待ってからお試しください。';
    case 'ERR_AUTH_INVALID_CREDENTIALS':
    case 'CredentialsSignin':
      return 'メールアドレスまたはパスワードが正しくありません。';
    default:
      return 'ログインに失敗しました。時間をおいてお試しください。';
  }
}
