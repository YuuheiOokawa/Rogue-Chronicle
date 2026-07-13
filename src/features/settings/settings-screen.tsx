'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { LogoutButton } from '@/features/auth/logout-button';
import { apiGet, apiSend } from '@/lib/api-client';
import type { SettingsResponse } from '@/types/api';

/** SCR-116 設定画面（docs/09 §4.13。変更は即時PUT保存+保存トースト） */
export function SettingsScreen({ isGuest }: { isGuest: boolean }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<SettingsResponse>('/api/v1/settings'),
  });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: (next: SettingsResponse) =>
      apiSend<SettingsResponse>('/api/v1/settings', { method: 'PUT', body: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] });
      const previous = queryClient.getQueryData<SettingsResponse>(['settings']);
      queryClient.setQueryData(['settings'], next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(['settings'], context.previous);
      showToast('保存に失敗しました');
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      showToast('✓ 保存しました');
    },
  });

  const update = (patch: Partial<SettingsResponse>) => {
    if (!data) return;
    mutation.mutate({ ...data, ...patch });
  };

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-6 py-6">
      <PageHeader title="設定" backHref="/home" />

      {isPending ? (
        <>
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-32" />
        </>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <>
          <Section title="ゲーム設定">
            <SettingRow label="戦闘速度">
              <div role="radiogroup" aria-label="戦闘速度" className="flex gap-1">
                {([1, 2] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    role="radio"
                    aria-checked={data.battleSpeed === speed}
                    onClick={() => update({ battleSpeed: speed })}
                    className={`h-11 w-14 rounded-lg text-sm font-semibold ${
                      data.battleSpeed === speed
                        ? 'bg-primary text-white'
                        : 'bg-surface-base text-content-muted'
                    }`}
                  >
                    x{speed}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="ダメージ表示">
              <Toggle
                checked={data.damageDisplay}
                label="ダメージ表示"
                onChange={(v) => update({ damageDisplay: v })}
              />
            </SettingRow>
            <SettingRow label="画面振動">
              <Toggle
                checked={data.screenShake}
                label="画面振動"
                onChange={(v) => update({ screenShake: v })}
              />
            </SettingRow>
            <SettingRow label="色覚アシスト">
              <Toggle
                checked={data.colorAssist}
                label="色覚アシスト"
                onChange={(v) => update({ colorAssist: v })}
              />
            </SettingRow>
          </Section>

          <Section title="アカウント">
            <SettingRow label={`種別: ${isGuest ? 'ゲスト ⚠' : '正式アカウント'}`}>
              {isGuest ? (
                <Link href="/transfer" className="text-sm font-semibold text-accent-gold underline">
                  引き継ぎ設定（推奨）
                </Link>
              ) : null}
            </SettingRow>
            <SettingRow label="ログアウト">
              <LogoutButton />
            </SettingRow>
          </Section>

          <Section title="その他">
            <LinkRow href="/help" label="ヘルプ" />
            <LinkRow href="/terms" label="利用規約" />
            <LinkRow href="/privacy" label="プライバシーポリシー" />
            <LinkRow href="/credits" label="クレジット" />
            <p className="px-1 pt-2 text-xs text-content-muted">バージョン 0.1.0</p>
          </Section>
        </>
      )}

      {toast ? (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-surface-raised px-4 py-2 text-sm shadow-lg"
        >
          {toast}
        </p>
      ) : null}
    </main>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4">
      <h2 className="pb-2 text-sm font-bold text-content-muted">▼ {props.title}</h2>
      {props.children}
    </section>
  );
}

function SettingRow(props: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm">{props.label}</span>
      {props.children}
    </div>
  );
}

function LinkRow(props: { href: string; label: string }) {
  return (
    <Link
      href={props.href}
      className="flex min-h-11 items-center text-sm text-content-muted hover:text-content"
    >
      ▶ {props.label}
    </Link>
  );
}

function Toggle(props: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      className="flex h-11 w-14 items-center justify-center" // タップ領域44px+
    >
      <span
        aria-hidden
        className={`relative h-7 w-12 rounded-full transition-colors ${
          props.checked ? 'bg-primary' : 'bg-surface-base'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
            props.checked ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
}
