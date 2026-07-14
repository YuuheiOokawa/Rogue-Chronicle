'use client';

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import { apiGet } from '@/lib/api-client';
import type {
  CodexListResponse,
  EnemyCodexEntry,
  EquipmentCodexEntry,
  RelicCodexEntry,
  SkillCodexEntry,
} from '@/server/usecases/codex/codex-view';

import {
  ELEMENT_LABELS,
  ENEMY_TYPE_LABELS,
  EQUIPMENT_SLOT_LABELS,
  RARITY_COLOR_CLASS,
  RARITY_LABELS,
  RELIC_TRIGGER_LABELS,
  SKILL_TARGET_TYPE_LABELS,
  elementText,
} from './labels';

type CodexTab = 'equipment' | 'skill' | 'relic' | 'enemy';

const TABS: { key: CodexTab; label: string }[] = [
  { key: 'equipment', label: '武器・防具' },
  { key: 'skill', label: 'スキル' },
  { key: 'relic', label: 'レリック' },
  { key: 'enemy', label: '敵' },
];

const EQUIPMENT_SLOT_FILTERS: { key: 'weapon' | 'armor' | 'accessory' | 'all'; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'accessory', label: 'アクセ' },
];

/**
 * SCR-107（武器一覧）/SCR-108（スキル図鑑）/SCR-109（レリック図鑑）/SCR-110（敵図鑑）統合画面
 * （docs/29 DEC-290: 4画面は同一テンプレートのためタブ切替で単一画面に統合）。
 * 発見済み=詳細、未発見=シルエット+「???」（docs/13 API-601「未発見エントリの詳細データは返さない」）。
 */
export function CodexScreen() {
  const [tab, setTab] = useState<CodexTab>('equipment');
  const [slotFilter, setSlotFilter] = useState<'weapon' | 'armor' | 'accessory' | 'all'>('all');

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-6 pt-6 pb-10">
      <PageHeader title="図鑑" backHref="/home" />

      <div role="tablist" aria-label="図鑑タブ" className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-10 shrink-0 rounded-lg px-3 text-sm font-semibold ${
              tab === t.key ? 'bg-primary text-white' : 'bg-surface-raised text-content-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equipment' ? (
        <div role="tablist" aria-label="装備スロット絞り込み" className="flex gap-1">
          {EQUIPMENT_SLOT_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={slotFilter === f.key}
              onClick={() => setSlotFilter(f.key)}
              className={`h-8 rounded-full px-3 text-xs font-semibold ${
                slotFilter === f.key
                  ? 'bg-accent-gold/20 text-accent-gold'
                  : 'bg-surface-raised text-content-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'equipment' ? (
        <EquipmentTab slotFilter={slotFilter} />
      ) : tab === 'skill' ? (
        <SkillTab />
      ) : tab === 'relic' ? (
        <RelicTab />
      ) : (
        <EnemyTab />
      )}
    </main>
  );
}

function DiscoveryRateHeader({ discoveredCount, totalCount }: { discoveredCount: number; totalCount: number }) {
  const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;
  return (
    <p className="text-sm text-content-muted">
      発見率 {discoveredCount}/{totalCount}（{pct}%）
    </p>
  );
}

function TabLoading() {
  return (
    <div className="grid grid-cols-3 gap-2">
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-24" />
    </div>
  );
}

function EmptyPanel() {
  return <p className="py-8 text-center text-sm text-content-muted">冒険で発見しよう</p>;
}

function UndiscoveredCard() {
  return (
    <div
      aria-hidden={false}
      className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg bg-surface-raised/60 p-2 text-center grayscale"
    >
      <span aria-hidden className="text-2xl opacity-50">
        ❔
      </span>
      <p className="text-xs font-bold text-content-muted">???</p>
    </div>
  );
}

function EquipmentTab({ slotFilter }: { slotFilter: 'weapon' | 'armor' | 'accessory' | 'all' }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['codex', 'equipment'],
    queryFn: () => apiGet<CodexListResponse<EquipmentCodexEntry>>('/api/v1/codex?type=equipment'),
  });

  if (isPending) return <TabLoading />;
  if (isError || !data) return <ErrorPanel onRetry={() => void refetch()} />;

  const items = data.items.filter((item) => {
    if (slotFilter === 'all') return true;
    return item.discovered ? item.slot === slotFilter : true; // 未発見はスロット不明のため常に表示
  });
  if (items.length === 0) return <EmptyPanel />;

  return (
    <>
      <DiscoveryRateHeader discoveredCount={data.discoveredCount} totalCount={data.totalCount} />
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) =>
          item.discovered ? (
            <li key={item.code} className="flex flex-col gap-1 rounded-lg bg-surface-raised p-2 text-center">
              <p className={`text-xs font-bold ${RARITY_COLOR_CLASS[item.rarity] ?? ''}`}>{item.name}</p>
              <p className="text-[10px] text-content-muted">
                {EQUIPMENT_SLOT_LABELS[item.slot] ?? item.slot} ・ {RARITY_LABELS[item.rarity] ?? item.rarity}
              </p>
              <p className="text-[10px] text-content-muted">
                {Object.entries(item.baseStats)
                  .map(([k, v]) => `${k}+${v}`)
                  .join(' ')}
              </p>
            </li>
          ) : (
            <li key={item.code}>
              <UndiscoveredCard />
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function SkillTab() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['codex', 'skill'],
    queryFn: () => apiGet<CodexListResponse<SkillCodexEntry>>('/api/v1/codex?type=skill'),
  });

  if (isPending) return <TabLoading />;
  if (isError || !data) return <ErrorPanel onRetry={() => void refetch()} />;
  if (data.items.length === 0) return <EmptyPanel />;

  return (
    <>
      <DiscoveryRateHeader discoveredCount={data.discoveredCount} totalCount={data.totalCount} />
      <ul className="grid grid-cols-3 gap-2">
        {data.items.map((item) =>
          item.discovered ? (
            <li key={item.code} className="flex flex-col gap-1 rounded-lg bg-surface-raised p-2 text-center">
              <p className={`text-xs font-bold ${RARITY_COLOR_CLASS[item.rarity] ?? ''}`}>{item.name}</p>
              <p className="text-[10px] text-content-muted">
                {elementText(item.element)} ・ SP{item.spCost}
              </p>
              <p className="text-[10px] text-content-muted">
                {SKILL_TARGET_TYPE_LABELS[item.targetType] ?? item.targetType}
              </p>
            </li>
          ) : (
            <li key={item.code}>
              <UndiscoveredCard />
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function RelicTab() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['codex', 'relic'],
    queryFn: () => apiGet<CodexListResponse<RelicCodexEntry>>('/api/v1/codex?type=relic'),
  });

  if (isPending) return <TabLoading />;
  if (isError || !data) return <ErrorPanel onRetry={() => void refetch()} />;
  if (data.items.length === 0) return <EmptyPanel />;

  return (
    <>
      <DiscoveryRateHeader discoveredCount={data.discoveredCount} totalCount={data.totalCount} />
      <ul className="grid grid-cols-3 gap-2">
        {data.items.map((item) =>
          item.discovered ? (
            <li key={item.code} className="flex flex-col gap-1 rounded-lg bg-surface-raised p-2 text-center">
              <p className={`text-xs font-bold ${RARITY_COLOR_CLASS[item.rarity] ?? ''}`}>
                {item.name}
                {item.isCursed ? <span aria-label="呪い"> 💀</span> : null}
              </p>
              <p className="text-[10px] text-content-muted">
                {RELIC_TRIGGER_LABELS[item.trigger] ?? item.trigger}
              </p>
            </li>
          ) : (
            <li key={item.code}>
              <UndiscoveredCard />
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function EnemyTab() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['codex', 'enemy'],
    queryFn: () => apiGet<CodexListResponse<EnemyCodexEntry>>('/api/v1/codex?type=enemy'),
  });

  if (isPending) return <TabLoading />;
  if (isError || !data) return <ErrorPanel onRetry={() => void refetch()} />;
  if (data.items.length === 0) return <EmptyPanel />;

  return (
    <>
      <DiscoveryRateHeader discoveredCount={data.discoveredCount} totalCount={data.totalCount} />
      <ul className="grid grid-cols-3 gap-2">
        {data.items.map((item) =>
          item.discovered ? (
            <li key={item.code} className="flex flex-col gap-1 rounded-lg bg-surface-raised p-2 text-center">
              <p className="text-xs font-bold">{item.name}</p>
              <p className="text-[10px] text-content-muted">
                {ENEMY_TYPE_LABELS[item.enemyType] ?? item.enemyType} ・ {ELEMENT_LABELS[item.element] ?? item.element}
              </p>
              <p className="text-[10px] text-content-muted">HP{item.baseStats.maxHp}</p>
            </li>
          ) : (
            <li key={item.code}>
              <UndiscoveredCard />
            </li>
          ),
        )}
      </ul>
    </>
  );
}
