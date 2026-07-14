'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { SKILLS } from '@/constants/masters/skills';
import { FormError, usePending } from '@/components/auth-form';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet, apiSend, ApiClientError } from '@/lib/api-client';
import type { PendingRewardView, RunView } from '@/server/usecases/run/run-view';

/**
 * SCR-303/304（スキル3択）・SCR-305（宝箱）・SCR-306（ショップ）・SCR-307（休憩）・
 * SCR-308（イベント）をpendingReward.typeで出し分ける単一ルート（docs/27 Phase7・実装指示で許容）。
 */

const RARITY_LABEL: Record<string, string> = { common: 'コモン', rare: 'レア', epic: 'エピック' };

function equipmentName(code: string): string {
  return EQUIPMENT.find((e) => e.code === code)?.name ?? code;
}
function relicName(code: string): string {
  return RELICS.find((r) => r.code === code)?.name ?? code;
}
function consumableName(code: string): string {
  return CONSUMABLES_BY_CODE[code as keyof typeof CONSUMABLES_BY_CODE]?.name ?? code;
}
function skillName(code: string): string {
  return SKILLS.find((s) => s.code === code)?.name ?? code;
}

export function RewardScreen({ initialView }: { initialView: RunView }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [pending, run] = usePending();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['run-current'],
    queryFn: () => apiGet<RunView>('/api/v1/runs/current'),
    initialData: initialView,
    staleTime: Infinity, // 更新は各アクション応答後の明示refetchで反映する（docs/13 §3.3）
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

  const afterAction = async () => {
    const res = await refetch();
    const next = res.data;
    if (!next) return;
    if (next.position.phase === 'battle') {
      router.push('/run/battle');
    } else if (next.position.phase === 'map_select') {
      queryClient.setQueryData(['run-current'], next);
      router.push('/run/map');
    }
    // reward_pendingのまま留まる場合（ショップ連続購入等）は何もしない（refetch済みの状態で再描画）
  };

  const callAction = (path: string, body: Record<string, unknown>, resultLabel?: string) =>
    run(async () => {
      setError(null);
      try {
        const res = await apiSend<Record<string, unknown>>(path, {
          method: 'POST',
          body: { version: view.version, ...body },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        });
        if (resultLabel) setLastResult(resultLabel);
        if (typeof res.resultText === 'string') setLastResult(res.resultText);
        await afterAction();
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

  const reward: PendingRewardView | null = view.pendingReward;

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
      <FormError message={error} />
      {lastResult ? (
        <p role="status" className="whitespace-pre-line rounded-lg bg-surface-raised px-3 py-2 text-sm">
          {lastResult}
        </p>
      ) : null}

      {!reward ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface-raised p-5 text-center">
          <p className="text-sm text-content-muted">受け取れる報酬はありません。</p>
          <button
            type="button"
            onClick={() => router.push('/run/map')}
            className="mx-auto h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-white"
          >
            マップへ戻る
          </button>
        </div>
      ) : null}

      {reward?.type === 'skill_choice' ? (
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-bold">スキルを選択（SCR-303）</h1>
          <p className="text-xs text-content-muted">リロール残り {reward.rerollRemaining} 回</p>
          {reward.choices.map((c, index) => (
            <button
              key={index}
              type="button"
              disabled={pending}
              onClick={() =>
                void callAction('/api/v1/runs/current/level-up/select', { action: 'pick', choiceIndex: index })
              }
              className="flex flex-col gap-1 rounded-lg bg-surface-raised p-3 text-left disabled:opacity-50"
            >
              <span className="text-sm font-semibold">{skillName(c.skillCode)}</span>
              <span className="text-xs text-content-muted">
                {RARITY_LABEL[c.rarity] ?? c.rarity} ・ {c.isUpgrade ? '強化' : '新規習得'}
              </span>
            </button>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || reward.rerollRemaining <= 0}
              onClick={() => void callAction('/api/v1/runs/current/level-up/select', { action: 'reroll' })}
              className="h-11 flex-1 rounded-lg border border-primary/60 text-sm text-primary disabled:opacity-40"
            >
              リロール
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void callAction('/api/v1/runs/current/level-up/select', { action: 'skip' })}
              className="h-11 flex-1 rounded-lg border border-content-muted/60 text-sm text-content-muted"
            >
              スキップ（HP10%回復）
            </button>
          </div>
        </section>
      ) : null}

      {reward?.type === 'treasure' ? (
        <section className="flex flex-col items-center gap-4 rounded-lg bg-surface-raised p-6 text-center">
          <h1 className="text-lg font-bold">宝箱を発見した（SCR-305）</h1>
          <button
            type="button"
            disabled={pending}
            onClick={() => void callAction('/api/v1/runs/current/treasure/open', {}, '宝箱を開けた！')}
            className="h-12 w-full max-w-[240px] rounded-lg bg-accent-gold font-semibold text-white disabled:opacity-50"
          >
            開ける
          </button>
        </section>
      ) : null}

      {reward?.type === 'shop' ? (
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-bold">商店（SCR-306）</h1>
          <p className="text-xs text-accent-gold">所持ゴールド {view.gold}G</p>
          {reward.slots.map((slot) => {
            const label =
              slot.kind === 'equipment'
                ? equipmentName(slot.code)
                : slot.kind === 'relic'
                  ? relicName(slot.code)
                  : consumableName(slot.code);
            return (
              <button
                key={slot.slotIndex}
                type="button"
                disabled={pending || slot.soldOut || view.gold < slot.price}
                onClick={() =>
                  void callAction(
                    '/api/v1/runs/current/shop/purchase',
                    { action: 'purchase', slotIndex: slot.slotIndex },
                    `${label}を購入した`,
                  )
                }
                className="flex items-center justify-between rounded-lg bg-surface-raised p-3 text-left text-sm disabled:opacity-40"
              >
                <span>
                  {label}
                  <span className="ml-2 text-xs text-content-muted">
                    {slot.kind === 'equipment' ? '装備' : slot.kind === 'relic' ? 'レリック' : '消耗品'}
                  </span>
                </span>
                <span className="font-mono text-accent-gold">{slot.soldOut ? '売切' : `${slot.price}G`}</span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={pending}
            onClick={() => void callAction('/api/v1/runs/current/shop/purchase', { action: 'leave' })}
            className="h-11 rounded-lg border border-content-muted/60 text-sm text-content-muted"
          >
            店を離れる
          </button>
        </section>
      ) : null}

      {reward?.type === 'rest' ? (
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-bold">休憩（SCR-307）</h1>
          <button
            type="button"
            disabled={pending}
            onClick={() => void callAction('/api/v1/runs/current/rest', { action: 'heal' })}
            className="h-12 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
          >
            HPを50%回復する
          </button>
          <div className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
            <span className="text-sm font-semibold">スキルを強化/削除</span>
            {view.skills.map((s) => {
              const master = SKILLS.find((m) => m.code === s.code);
              const maxLevel = master?.maxLevel ?? 3;
              return (
                <div key={s.code} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {skillName(s.code)} Lv{s.level}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={pending || s.level >= maxLevel}
                      onClick={() =>
                        void callAction('/api/v1/runs/current/rest', {
                          action: 'upgrade_skill',
                          skillCode: s.code,
                        })
                      }
                      className="rounded border border-primary/60 px-2 py-1 text-xs text-primary disabled:opacity-40"
                    >
                      強化
                    </button>
                    <button
                      type="button"
                      disabled={pending || master?.isInnate}
                      onClick={() =>
                        void callAction('/api/v1/runs/current/rest', {
                          action: 'delete_skill',
                          skillCode: s.code,
                        })
                      }
                      className="rounded border border-damage/60 px-2 py-1 text-xs text-damage disabled:opacity-40"
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {reward?.type === 'event' ? (
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-bold">
            {reward.nodeType === 'BLESS' ? '祝福（SCR-308）' : reward.nodeType === 'CURSE' ? '呪い（SCR-308）' : 'イベント（SCR-308）'}
          </h1>
          {reward.autoResolved ? (
            <div className="flex flex-col gap-3 rounded-lg bg-surface-raised p-4">
              <p className="whitespace-pre-line text-sm">{reward.autoResolved.resultText}</p>
              <button
                type="button"
                disabled={pending}
                onClick={() => void callAction('/api/v1/runs/current/event/choose', {})}
                className="h-11 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
              >
                閉じる
              </button>
            </div>
          ) : (
            reward.choices.map((c) => (
              <button
                key={c.index}
                type="button"
                disabled={pending}
                onClick={() => void callAction('/api/v1/runs/current/event/choose', { choiceIndex: c.index })}
                className="rounded-lg bg-surface-raised p-3 text-left text-sm disabled:opacity-50"
              >
                {c.label}
              </button>
            ))
          )}
        </section>
      ) : null}
    </main>
  );
}
