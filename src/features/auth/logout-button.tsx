'use client';

import { signOut } from 'next-auth/react';

import { usePending } from '@/components/auth-form';

/** ログアウト（API-003はAuth.js signOutで実現）。確認ダイアログ必須（docs/08 §2） */
export function LogoutButton() {
  const [pending, run] = usePending();

  const logout = () =>
    run(async () => {
      // ゲストはログアウトするとこの端末から戻れなくなるため必ず確認する
      const ok = window.confirm(
        'ログアウトしますか？\n（ゲストプレイ中の場合、引き継ぎ設定をしていないとこのデータへ戻れなくなります）',
      );
      if (!ok) return;
      await signOut({ redirectTo: '/' });
    });

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded-lg border border-surface-raised px-3 py-2 text-sm text-content-muted disabled:opacity-50"
    >
      ログアウト
    </button>
  );
}
