'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { SKILLS } from '@/constants/masters/skills';
import { FormError, usePending } from '@/components/auth-form';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet, apiSend, ApiClientError } from '@/lib/api-client';
import type { RunView } from '@/server/usecases/run/run-view';

const SLOT_LABEL: Record<'weapon' | 'armor' | 'accessory', string> = {
  weapon: '武器',
  armor: '防具',
  accessory: '装飾品',
};

/** SCR-309 装備変更 + SCR-312 所持品確認（単一ルート、docs/27 Phase7・実装指示で許容） */
export function EquipmentScreen({ initialView }: { initialView: RunView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = usePending();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['run-current'],
    queryFn: () => apiGet<RunView>('/api/v1/runs/current'),
    initialData: initialView,
    staleTime: Infinity,
  });

  if (isPending && !data) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-40 w-full" />
      </main>
    );
  }
  if (isError || !data) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-4 py-6">
        <ErrorPanel onRetry={() => void refetch()} />
      </main>
    );
  }

  const view = data;

  const act = (action: 'equip' | 'discard', equipmentCode: string) =>
    run(async () => {
      setError(null);
      try {
        await apiSend('/api/v1/runs/current/equipment', {
          method: 'POST',
          body: { version: view.version, action, equipmentCode },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        });
        await refetch();
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.errorCode === 'ERR_CONFLICT_VERSION' || err.errorCode === 'ERR_RUN_STATE_INVALID') {
            await refetch();
            setError('データが更新されていたため、最新の状態に同期しました。');
            return;
          }
          setError(err.message);
          return;
        }
        setError('通信に失敗しました。時間をおいてお試しください。');
      }
    });

  const ownedNotEquipped = view.encounteredEquipment.filter(
    (code) => !Object.values(view.equipment).includes(code),
  );

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">装備 / 所持品</h1>
        <button
          type="button"
          onClick={() => router.push('/run/map')}
          className="text-xs text-primary underline"
        >
          マップへ戻る
        </button>
      </header>

      <FormError message={error} />

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <span className="text-sm font-semibold">装備中（SCR-309）</span>
        {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
          const code = view.equipment[slot];
          const master = code ? EQUIPMENT.find((e) => e.code === code) : null;
          return (
            <div key={slot} className="flex items-center justify-between text-sm">
              <span>
                {SLOT_LABEL[slot]}: {master ? master.name : '（なし）'}
              </span>
              {code ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void act('discard', code)}
                  className="rounded border border-damage/60 px-2 py-1 text-xs text-damage disabled:opacity-40"
                >
                  外す
                </button>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <span className="text-sm font-semibold">このランで入手した装備（未装着）</span>
        {ownedNotEquipped.length === 0 ? (
          <p className="text-xs text-content-muted">なし</p>
        ) : (
          ownedNotEquipped.map((code) => {
            const master = EQUIPMENT.find((e) => e.code === code);
            if (!master) return null;
            return (
              <div key={code} className="flex items-center justify-between text-sm">
                <span>
                  {master.name}
                  <span className="ml-2 text-xs text-content-muted">{SLOT_LABEL[master.slot]}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void act('equip', code)}
                  className="rounded border border-primary/60 px-2 py-1 text-xs text-primary disabled:opacity-40"
                >
                  装着
                </button>
              </div>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <span className="text-sm font-semibold">所持アイテム（SCR-312）</span>
        {view.items.filter((i) => i.count > 0).length === 0 ? (
          <p className="text-xs text-content-muted">なし</p>
        ) : (
          view.items
            .filter((i) => i.count > 0)
            .map((i) => (
              <div key={i.code} className="flex items-center justify-between text-sm">
                <span>{CONSUMABLES_BY_CODE[i.code as keyof typeof CONSUMABLES_BY_CODE]?.name ?? i.code}</span>
                <span className="text-content-muted">×{i.count}</span>
              </div>
            ))
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <span className="text-sm font-semibold">レリック</span>
        {view.relics.length === 0 ? (
          <p className="text-xs text-content-muted">なし</p>
        ) : (
          view.relics.map((code) => (
            <p key={code} className="text-sm">
              {RELICS.find((r) => r.code === code)?.name ?? code}
            </p>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <span className="text-sm font-semibold">習得スキル</span>
        {view.skills.map((s) => (
          <p key={s.code} className="text-sm">
            {SKILLS.find((m) => m.code === s.code)?.name ?? s.code} Lv{s.level}
          </p>
        ))}
      </section>
    </main>
  );
}
