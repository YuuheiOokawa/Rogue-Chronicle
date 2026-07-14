'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader, ShardBadge } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { ApiClientError, apiGet, apiSend } from '@/lib/api-client';

/**
 * SCR-106 永続強化画面（docs/09 §4.11 / API-204）。
 * レスポンス型は本APIルート専用（src/app/api/v1/player/upgrades/route.ts）と対応する
 * フロント側の定義。route.ts側の型と直接結合させず、featureファイル内で再定義する。
 */
interface UpgradeNodeView {
  code: string;
  name: string;
  description: string;
  effect: { type: string; valuePerRank: number };
  maxRank: number;
  costPerRank: number[];
  prerequisiteCode: string | null;
  rank: number;
  unlockable: boolean;
}

interface UpgradesResponse {
  items: UpgradeNodeView[];
  totalBonusPct: { hp: number; atk: number; capPct: number };
  soulShards: number;
}

interface UpgradePurchaseResponse {
  upgradeNodeCode: string;
  rank: number;
  maxRank: number;
  currencies: { soulShards: number };
}

function statusLabel(node: UpgradeNodeView): { icon: string; text: string } {
  if (node.rank >= node.maxRank) return { icon: '✓', text: '取得済み' };
  if (node.unlockable) return { icon: '✦', text: '取得可能' };
  return { icon: '🔒', text: '前提未達' };
}

/** 初期選択: 「次に取得可能な最安ノード」（docs/09 SCR-106 仮決定）。取得可能ノードが無ければ先頭ノード。 */
function defaultSelectedCode(data: UpgradesResponse): string | null {
  const purchasable = data.items.filter((n) => n.unlockable);
  const cheapest = [...purchasable].sort(
    (a, b) => a.costPerRank[a.rank] - b.costPerRank[b.rank],
  )[0];
  return (cheapest ?? data.items[0])?.code ?? null;
}

/** SCR-106 永続強化画面。ツリー一覧+詳細パネル（固定）+強化実行 */
export function UpgradeScreen() {
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['player', 'upgrades'],
    queryFn: () => apiGet<UpgradesResponse>('/api/v1/player/upgrades'),
  });

  // ユーザーが未選択の間は「次に取得可能な最安ノード」を既定選択にする（setStateはユーザー操作時のみ）
  const effectiveSelectedCode = selectedCode ?? (data ? defaultSelectedCode(data) : null);

  const mutation = useMutation({
    mutationFn: (node: UpgradeNodeView) =>
      apiSend<UpgradePurchaseResponse>('/api/v1/player/upgrades', {
        method: 'POST',
        body: { upgradeNodeCode: node.code, targetRank: node.rank + 1 },
      }),
    onSuccess: () => {
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['player', 'upgrades'] });
      void queryClient.invalidateQueries({ queryKey: ['player', 'currencies'] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.errorCode === 'ERR_INSUFFICIENT_SHARDS') {
        setErrorMessage('ソウルシャードが不足しています。');
        return;
      }
      if (err instanceof ApiClientError && err.errorCode === 'ERR_REWARD_ALREADY_CLAIMED') {
        setErrorMessage('この強化は購入済みです。最新の状態に同期します。');
        void refetch();
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : '強化に失敗しました。');
      void refetch();
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-6 pt-6 pb-32">
      <PageHeader
        title="永続強化"
        backHref="/home"
        right={<ShardBadge soulShards={data?.soulShards} />}
      />

      {isPending ? (
        <>
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-64 w-full" />
        </>
      ) : isError || !data ? (
        <ErrorPanel onRetry={() => void refetch()} />
      ) : (
        <UpgradeContent
          data={data}
          selectedCode={effectiveSelectedCode}
          onSelect={setSelectedCode}
          onPurchase={(node) => {
            setErrorMessage(null);
            mutation.mutate(node);
          }}
          pending={mutation.isPending}
          errorMessage={errorMessage}
        />
      )}
    </main>
  );
}

function UpgradeContent(props: {
  data: UpgradesResponse;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onPurchase: (node: UpgradeNodeView) => void;
  pending: boolean;
  errorMessage: string | null;
}) {
  const { data, selectedCode, onSelect, onPurchase, pending, errorMessage } = props;
  const selected = data.items.find((n) => n.code === selectedCode) ?? null;

  return (
    <>
      <TotalBonusGauge totalBonusPct={data.totalBonusPct} />

      <p className="text-xs text-content-muted">
        永続強化はラン中には反映されません。次のラン開始時から適用されます。
      </p>

      <ul className="flex flex-col gap-2">
        {data.items.map((node) => {
          const status = statusLabel(node);
          const active = node.code === selectedCode;
          return (
            <li key={node.code}>
              <button
                type="button"
                onClick={() => onSelect(node.code)}
                aria-label={`${node.name} レベル${node.rank}/${node.maxRank} ${status.text}`}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/10'
                    : node.rank >= node.maxRank
                      ? 'border-accent-gold/60 bg-surface-raised'
                      : node.unlockable
                        ? 'border-primary/40 bg-surface-raised'
                        : 'border-surface-raised bg-surface-raised/60 opacity-60'
                }`}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{node.name}</span>
                  <span className="text-xs text-content-muted">{node.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  <span aria-hidden>{status.icon}</span>
                  <span className="text-content-muted">
                    Lv{node.rank}/{node.maxRank}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <DetailPanel
          node={selected}
          soulShards={data.soulShards}
          onPurchase={onPurchase}
          pending={pending}
          errorMessage={errorMessage}
        />
      ) : null}
    </>
  );
}

function TotalBonusGauge(props: { totalBonusPct: { hp: number; atk: number; capPct: number } }) {
  const { hp, atk, capPct } = props.totalBonusPct;
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4">
      <p className="text-sm font-bold">合計強化率（上限+{capPct}%）</p>
      <BonusBar label="❤HP" value={hp} cap={capPct} />
      <BonusBar label="⚔ATK" value={atk} cap={capPct} />
    </section>
  );
}

function BonusBar(props: { label: string; value: number; cap: number }) {
  const ratio = props.cap > 0 ? Math.min(1, props.value / props.cap) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10">{props.label}</span>
      <div
        aria-label={`${props.label} 合計+${props.value}% / 上限+${props.cap}%`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base"
      >
        <div className="h-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="w-14 text-right text-content-muted">
        +{props.value}% / {props.cap}%
      </span>
    </div>
  );
}

function DetailPanel(props: {
  node: UpgradeNodeView;
  soulShards: number;
  onPurchase: (node: UpgradeNodeView) => void;
  pending: boolean;
  errorMessage: string | null;
}) {
  const { node, soulShards, onPurchase, pending, errorMessage } = props;
  const maxed = node.rank >= node.maxRank;
  const nextCost = maxed ? null : node.costPerRank[node.rank];
  const affordable = nextCost !== null && soulShards >= nextCost;
  const canPurchase = !maxed && node.unlockable && affordable && !pending;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-raised bg-surface-base/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-[480px] flex-col gap-2">
        <p className="text-sm font-bold">
          選択中: {node.name}（Lv{node.rank}→{maxed ? node.rank : node.rank + 1}）
        </p>
        <p className="text-xs text-content-muted">{node.description}</p>

        {errorMessage ? (
          <p role="alert" className="text-xs text-damage">
            {errorMessage}
          </p>
        ) : maxed ? (
          <p className="text-xs text-content-muted">最大レベルまで取得済みです。</p>
        ) : !node.unlockable ? (
          <p className="text-xs text-content-muted">
            前提となる強化を先に取得してください。
          </p>
        ) : !affordable ? (
          <p className="text-xs text-content-muted">
            ソウルシャードが不足しています（あと {((nextCost ?? 0) - soulShards).toLocaleString()}）
          </p>
        ) : (
          <p className="text-xs text-content-muted">コスト: 💎{nextCost?.toLocaleString()}</p>
        )}

        <button
          type="button"
          disabled={!canPurchase}
          onClick={() => onPurchase(node)}
          className="h-12 w-full rounded-lg bg-primary font-bold text-white disabled:opacity-50"
        >
          {pending ? '強化中…' : maxed ? '取得済み' : `強化する${nextCost !== null ? `（💎${nextCost.toLocaleString()}）` : ''}`}
        </button>
      </div>
    </div>
  );
}
