'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { PageHeader, ShardBadge } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { ApiClientError, apiGet, apiSend } from '@/lib/api-client';
import type { CharacterDetailResponse, CurrenciesResponse, UnlockResponse } from '@/types/api';

import { elementText, WEAPON_TYPE_LABELS } from './labels';

/** SCR-105 キャラクター詳細画面（docs/09 §4.12）。未解放時はステータスをマスク表示 */
export function CharacterDetailScreen({ code }: { code: string }) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['characters', code],
    queryFn: () => apiGet<CharacterDetailResponse>(`/api/v1/characters/${code}`),
    retry: (count, err) => count < 1 && !(err instanceof ApiClientError && err.status === 404),
  });
  const { data: currencies } = useQuery({
    queryKey: ['player', 'currencies'],
    queryFn: () => apiGet<CurrenciesResponse>('/api/v1/player/currencies'),
  });

  const notFound = error instanceof ApiClientError && error.errorCode === 'ERR_NOT_FOUND';

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-6 py-6 pb-28">
      <PageHeader
        title="キャラクター詳細"
        backHref="/characters"
        right={<ShardBadge soulShards={currencies?.soulShards} />}
      />

      {isPending ? (
        <>
          <SkeletonBlock className="h-36 w-full" />
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </>
      ) : isError || !data ? (
        <ErrorPanel
          message={notFound ? 'キャラクターが見つかりません。' : undefined}
          onRetry={() => void refetch()}
        />
      ) : (
        <DetailContent data={data} code={code} soulShards={currencies?.soulShards} />
      )}
    </main>
  );
}

function DetailContent(props: {
  data: CharacterDetailResponse;
  code: string;
  soulShards: number | undefined;
}) {
  const { data, code, soulShards } = props;

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4">
        <div
          aria-hidden
          className={`flex h-28 items-center justify-center rounded-lg bg-surface-base text-6xl ${
            data.unlocked ? '' : 'grayscale'
          }`}
        >
          {data.unlocked ? '🛡' : '👤'}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold">{data.name}</p>
          <span className="text-sm">{elementText(data.element)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-content-muted">
          <span>{data.type}</span>
          {data.unlocked ? (
            <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
              解放済み
            </span>
          ) : (
            <span className="rounded bg-surface-base px-2 py-0.5 text-xs">未解放🔒</span>
          )}
        </div>
        <p className="text-sm text-content-muted">{data.description}</p>
        <p className="text-xs text-content-muted">
          得意武器: {WEAPON_TYPE_LABELS[data.favoredWeaponType] ?? data.favoredWeaponType}
        </p>
      </section>

      <Section title="初期ステータス">
        {data.baseStats ? (
          <ul className="grid grid-cols-3 gap-2 text-sm">
            <li>❤HP {data.baseStats.maxHp}</li>
            <li>⚔ATK {data.baseStats.atk}</li>
            <li>🛡DEF {data.baseStats.def}</li>
            <li>👟SPD {data.baseStats.spd}</li>
            <li>🎯クリ率 {data.baseStats.critRate}%</li>
          </ul>
        ) : (
          <MaskedNote />
        )}
      </Section>

      <Section title="固有能力">
        <p className="text-sm font-semibold text-accent-gold">✦ {data.uniqueAbility.name}</p>
        <p className="text-sm text-content-muted">{data.uniqueAbility.description}</p>
      </Section>

      <Section title="成長傾向">
        {data.growthRates ? (
          <ul className="flex flex-col gap-2">
            <GrowthBar label="HP" value={data.growthRates.maxHp} />
            <GrowthBar label="ATK" value={data.growthRates.atk} />
            <GrowthBar label="DEF" value={data.growthRates.def} />
            <GrowthBar label="SPD" value={data.growthRates.spd} />
          </ul>
        ) : (
          <MaskedNote />
        )}
      </Section>

      <Section title="初期スキル">
        <ul className="flex flex-col gap-2">
          {data.initialSkills.map((skill) => (
            <li key={skill.code} className="text-sm">
              <span className="font-semibold">{skill.name}</span>
              <span className="ml-2 text-xs text-content-muted">
                {elementText(skill.element)} / SP{skill.spCost}
              </span>
              <p className="text-xs text-content-muted">{skill.description}</p>
            </li>
          ))}
        </ul>
      </Section>

      {data.unlocked ? null : <UnlockSection data={data} code={code} soulShards={soulShards} />}
    </>
  );
}

function UnlockSection(props: {
  data: CharacterDetailResponse;
  code: string;
  soulShards: number | undefined;
}) {
  const { data, code, soulShards } = props;
  const condition = data.unlockCondition;
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlockedNow, setUnlockedNow] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // リトライ時に同一キーを再送できるよう、解放試行ごとに1つのIdempotency-Keyを保持する
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['characters'] });
    void queryClient.invalidateQueries({ queryKey: ['home'] });
    void queryClient.invalidateQueries({ queryKey: ['player'] });
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiSend<UnlockResponse>(`/api/v1/characters/${code}/unlock`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
      }),
    onSuccess: () => {
      setConfirmOpen(false);
      setUnlockedNow(true);
      idempotencyKeyRef.current = crypto.randomUUID();
      invalidateAll();
    },
    onError: (err) => {
      setConfirmOpen(false);
      if (err instanceof ApiClientError && err.errorCode === 'ERR_REWARD_ALREADY_CLAIMED') {
        // 受領済みは成功扱い（docs/09 §2.4）
        setUnlockedNow(true);
        invalidateAll();
        return;
      }
      if (err instanceof ApiClientError && err.errorCode === 'ERR_INSUFFICIENT_SHARDS') {
        setErrorMessage('ソウルシャードが不足しています');
        invalidateAll();
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : '解放に失敗しました');
    },
  });

  if (unlockedNow) {
    return (
      <div
        role="status"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-accent-gold/60 bg-surface-base/95 p-4 backdrop-blur"
      >
        <p className="mx-auto max-w-[480px] text-center text-base font-bold text-accent-gold">
          ✦ {data.name} を解放しました！
        </p>
      </div>
    );
  }

  if (!condition) return null;

  if (condition.type === 'achievement') {
    return (
      <Section title="解放条件">
        <p className="text-sm">
          実績「{condition.achievementName}」の達成で解放（進捗{' '}
          {Math.min(condition.progress, condition.goal)}/{condition.goal}）
        </p>
      </Section>
    );
  }

  const balance = soulShards ?? 0;
  const affordable = balance >= condition.requiredShards;

  return (
    <>
      <Section title="解放条件">
        <p className="text-sm">💎 ソウルシャード {condition.requiredShards.toLocaleString()}</p>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-raised bg-surface-base/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] flex-col gap-2">
          {errorMessage ? (
            <p role="alert" className="text-center text-xs text-damage">
              {errorMessage}
            </p>
          ) : !affordable ? (
            <p className="text-center text-xs text-content-muted">
              ソウルシャードが不足しています（必要 {condition.requiredShards.toLocaleString()} /
              所持 {balance.toLocaleString()}）
            </p>
          ) : null}
          <button
            type="button"
            disabled={!affordable || mutation.isPending}
            onClick={() => {
              setErrorMessage(null);
              setConfirmOpen(true);
            }}
            className="h-12 w-full rounded-lg bg-primary font-bold text-white disabled:opacity-50"
          >
            {mutation.isPending
              ? '解放中…'
              : `💎${condition.requiredShards.toLocaleString()}で解放する（所持 ${balance.toLocaleString()}）`}
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="キャラクター解放の確認"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6"
        >
          <div className="flex w-full max-w-[360px] flex-col gap-4 rounded-lg bg-surface-raised p-5">
            <p className="text-base font-bold">{data.name} を解放しますか？</p>
            <p className="text-sm text-content-muted">
              ソウルシャードを {condition.requiredShards.toLocaleString()} 消費します（所持{' '}
              {balance.toLocaleString()}）
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={mutation.isPending}
                className="h-12 flex-1 rounded-lg border border-surface-base text-sm text-content-muted disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="h-12 flex-1 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-50"
              >
                {mutation.isPending ? '解放中…' : '解放する'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4">
      <h2 className="text-sm font-bold text-content-muted">▼ {props.title}</h2>
      {props.children}
    </section>
  );
}

function MaskedNote() {
  return <p className="text-sm text-content-muted">？？？（解放すると確認できます）</p>;
}

/** 成長率係数0.8〜1.2をバーで視覚化（aria-labelで数値読み上げ。docs/09 SCR-105） */
function GrowthBar(props: { label: string; value: number }) {
  const ratio = Math.min(Math.max((props.value - 0.8) / 0.4, 0), 1);
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="w-10">{props.label}</span>
      <div
        aria-label={`${props.label}成長 係数${props.value}`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base"
      >
        <div className="h-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="w-8 text-right text-content-muted">×{props.value.toFixed(2)}</span>
    </li>
  );
}
