'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError, usePending } from '@/components/auth-form';
import { ErrorPanel, SkeletonBlock } from '@/components/query-states';
import type { ActionLogEntry } from '@/domain/battle/types';
import { apiGet, apiSend, ApiClientError } from '@/lib/api-client';
import type { BattleActionInput } from '@/schemas/battle';
import type { BattleEnemyView, BattleView } from '@/server/usecases/battle/battle-view';

/** SCR-302 戦闘画面（docs/09 §4.7）。演出は最小限（テキスト+数値のみ）。 */

interface BattleStateResponse {
  version: number;
  battle: BattleView;
}

interface BattleActionResponse {
  version: number;
  logs: ActionLogEntry[];
  battle: BattleView;
  battleEnded: boolean;
  result?: 'win' | 'lose' | 'fled';
  reward?: { gold: number; exp: number; drops: unknown[] };
  levelUp?: { levels: number };
  runStatus: 'active' | 'cleared' | 'failed';
}

const ACTOR_LABEL: Record<string, string> = { player: 'あなた' };

function actorLabel(id: string, view: BattleView): string {
  if (id === 'player') return ACTOR_LABEL.player;
  const enemy = view.enemies.find((e) => e.id === id);
  return enemy?.name ?? id;
}

function formatLog(entry: ActionLogEntry, view: BattleView): string {
  const actor = actorLabel(entry.actorId, view);
  if (entry.note === 'incapacitated') return `${actor}は動けない！`;
  if (entry.action === 'flee') {
    return entry.note === 'fled_success' ? `${actor}は逃走した！` : `${actor}は逃走に失敗した…`;
  }
  const targetLabel = entry.targetId ? actorLabel(entry.targetId, view) : '';
  if (entry.isMiss) return `${actor}の攻撃！${targetLabel}に外れた`;
  const parts: string[] = [];
  if (entry.action === 'guard') parts.push(`${actor}は防御した`);
  else if (entry.action === 'item') parts.push(`${actor}はアイテムを使用した`);
  else if (entry.action === 'status_tick') parts.push(`${actor}は${entry.detailCode ?? '状態異常'}のダメージを受けた`);
  else parts.push(`${actor}の${entry.action === 'skill' ? 'スキル' : '攻撃'}！`);
  if (entry.damage !== undefined) parts.push(`${targetLabel}に${entry.damage}ダメージ${entry.isCrit ? '（クリティカル！）' : ''}`);
  if (entry.healed !== undefined) parts.push(`${targetLabel || actor}のHPが${entry.healed}回復`);
  return parts.join(' ');
}

function EnemyCard({
  enemy,
  selectable,
  selected,
  onSelect,
}: {
  enemy: BattleEnemyView;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  return (
    <button
      type="button"
      disabled={!selectable || !enemy.alive}
      onClick={onSelect}
      aria-label={`${enemy.name}${enemy.alive ? '' : '（撃破）'}${
        enemy.intent ? ` 次の行動: ${enemy.intent.label}` : ''
      }`}
      className={[
        'flex flex-1 flex-col gap-1 rounded-lg border p-3 text-left transition-all',
        !enemy.alive
          ? 'border-transparent bg-surface-raised/40 opacity-40'
          : selected
            ? 'border-accent-gold bg-surface-raised ring-2 ring-accent-gold'
            : selectable
              ? 'border-primary/60 bg-surface-raised hover:bg-surface-raised/80'
              : 'border-transparent bg-surface-raised',
      ].join(' ')}
    >
      <span className="text-sm font-semibold">{enemy.name}</span>
      <div
        role="progressbar"
        aria-valuenow={enemy.hp}
        aria-valuemin={0}
        aria-valuemax={enemy.maxHp}
        className="h-2 overflow-hidden rounded bg-surface-base"
      >
        <div className="h-full bg-damage" style={{ width: `${Math.max(0, hpRatio) * 100}%` }} />
      </div>
      <span className="font-mono text-xs text-content-muted">
        HP {enemy.hp}/{enemy.maxHp}
      </span>
      {enemy.alive && enemy.intent ? (
        <span className="text-xs text-content-muted">次: {enemy.intent.label}</span>
      ) : null}
      {enemy.statuses.length > 0 ? (
        <span className="text-xs text-accent-gold">
          {enemy.statuses.map((s) => `${s.code}${s.remainingTurns}`).join(' ')}
        </span>
      ) : null}
    </button>
  );
}

export function BattleScreen({
  initialVersion,
  initialBattle,
}: {
  initialVersion: number;
  initialBattle: BattleView;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [logFeed, setLogFeed] = useState<{ text: string; key: number }[]>([]);
  const [logKeySeed, setLogKeySeed] = useState(0);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [itemPanelOpen, setItemPanelOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<{ type: 'attack' } | { type: 'skill'; skillCode: string } | null>(
    null,
  );
  const [endOverlay, setEndOverlay] = useState<BattleActionResponse | null>(null);
  const [pending, run] = usePending();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['battle'],
    queryFn: () => apiGet<BattleStateResponse>('/api/v1/runs/current/battle'),
    initialData: { version: initialVersion, battle: initialBattle },
    staleTime: Infinity, // 更新はAPI-402応答で明示的にキャッシュへ反映する（差分適用はしない・docs/13 §3.3）
  });

  if (isPending && !data) {
    return (
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
        <SkeletonBlock className="h-40 w-full" />
        <SkeletonBlock className="h-24 w-full" />
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

  const { version, battle } = data;

  const pushLogs = (logs: ActionLogEntry[]) => {
    const formatted = logs.map((l) => ({ text: formatLog(l, battle), key: logKeySeed + Math.random() }));
    setLogKeySeed((k) => k + logs.length);
    setLogFeed((prev) => [...formatted.reverse(), ...prev].slice(0, 20));
  };

  const sendAction = (action: BattleActionInput) =>
    run(async () => {
      setError(null);
      try {
        const res = await apiSend<BattleActionResponse>('/api/v1/runs/current/battle/actions', {
          method: 'POST',
          body: { version, action },
          headers: { 'Idempotency-Key': crypto.randomUUID() }, // 操作ごとに生成（docs/13 §2.10）
        });
        queryClient.setQueryData<BattleStateResponse>(['battle'], {
          version: res.version,
          battle: res.battle,
        });
        pushLogs(res.logs);
        setTargetMode(null);
        setSkillPanelOpen(false);
        setItemPanelOpen(false);
        if (res.battleEnded) {
          setEndOverlay(res);
        }
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

  const aliveEnemies = battle.enemies.filter((e) => e.alive);
  const inputLocked = pending || battle.result !== 'ongoing' || endOverlay !== null;

  const chooseTarget = (targetId: string) => {
    if (!targetMode) return;
    if (targetMode.type === 'attack') {
      void sendAction({ type: 'attack', targetId });
    } else {
      void sendAction({ type: 'skill', skillCode: targetMode.skillCode, targetId });
    }
  };

  const startAttack = () => {
    if (aliveEnemies.length === 1) {
      void sendAction({ type: 'attack', targetId: aliveEnemies[0].id });
      return;
    }
    setTargetMode({ type: 'attack' });
    setSkillPanelOpen(false);
    setItemPanelOpen(false);
  };

  const chooseSkill = (skillCode: string) => {
    if (aliveEnemies.length === 1) {
      void sendAction({ type: 'skill', skillCode, targetId: aliveEnemies[0].id });
      return;
    }
    setTargetMode({ type: 'skill', skillCode });
    setSkillPanelOpen(false);
  };

  const returnToMap = () => {
    void queryClient.invalidateQueries({ queryKey: ['battle'] });
    router.push('/run/map');
  };

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between text-sm">
        <span className="font-bold">ターン {battle.turnNo}</span>
        {battle.canFlee && battle.fleeChance !== null ? (
          <span className="text-xs text-content-muted">逃走成功率 {battle.fleeChance}%</span>
        ) : null}
      </header>

      <FormError message={error} />

      {targetMode ? (
        <p role="status" className="rounded-lg bg-surface-raised px-3 py-2 text-center text-sm">
          対象を選択してください
          <button
            type="button"
            onClick={() => setTargetMode(null)}
            className="ml-3 text-xs text-primary underline"
          >
            キャンセル
          </button>
        </p>
      ) : null}

      {/* 敵エリア */}
      <div className="flex gap-2">
        {battle.enemies.map((enemy) => (
          <EnemyCard
            key={enemy.id}
            enemy={enemy}
            selectable={targetMode !== null && enemy.alive}
            selected={false}
            onSelect={() => chooseTarget(enemy.id)}
          />
        ))}
      </div>

      {/* 戦闘ログ */}
      <div
        aria-live="polite"
        className="flex max-h-32 flex-col-reverse gap-1 overflow-y-auto rounded-lg bg-surface-raised p-3 text-xs text-content-muted"
      >
        {logFeed.length === 0 ? <p>戦闘開始！</p> : logFeed.map((l) => <p key={l.key}>{l.text}</p>)}
      </div>

      {/* プレイヤーエリア */}
      <div className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-8 text-hp">HP</span>
          <div
            role="progressbar"
            aria-valuenow={battle.player.hp}
            aria-valuemin={0}
            aria-valuemax={battle.player.maxHp}
            className="h-2 flex-1 overflow-hidden rounded bg-surface-base"
          >
            <div
              className="h-full bg-hp"
              style={{ width: `${(battle.player.hp / battle.player.maxHp) * 100}%` }}
            />
          </div>
          <span className="font-mono">
            {battle.player.hp}/{battle.player.maxHp}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-8 text-sp">SP</span>
          <div
            role="progressbar"
            aria-valuenow={battle.player.sp}
            aria-valuemin={0}
            aria-valuemax={battle.player.maxSp}
            className="h-2 flex-1 overflow-hidden rounded bg-surface-base"
          >
            <div
              className="h-full bg-sp"
              style={{ width: `${(battle.player.sp / battle.player.maxSp) * 100}%` }}
            />
          </div>
          <span className="font-mono">
            {battle.player.sp}/{battle.player.maxSp}
          </span>
        </div>
        {battle.player.statuses.length > 0 ? (
          <p className="text-xs text-accent-gold">
            {battle.player.statuses.map((s) => `${s.code}(${s.remainingTurns})`).join(' ')}
          </p>
        ) : null}
      </div>

      {/* スキルパネル */}
      {skillPanelOpen ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>スキル選択</span>
            <button type="button" onClick={() => setSkillPanelOpen(false)} className="text-xs text-content-muted">
              閉じる ✕
            </button>
          </div>
          {battle.player.skills.length === 0 ? (
            <p className="text-xs text-content-muted">習得スキルなし</p>
          ) : (
            battle.player.skills.map((s) => (
              <button
                key={s.code}
                type="button"
                disabled={!s.usable || inputLocked}
                onClick={() => chooseSkill(s.code)}
                className="flex items-center justify-between rounded-lg bg-surface-base px-3 py-2 text-left text-sm disabled:opacity-40"
              >
                <span>
                  {s.code} Lv{s.level}
                </span>
                <span className={s.usable ? 'text-sp' : 'text-damage'}>SP{s.spCost}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {/* アイテムパネル */}
      {itemPanelOpen ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>アイテム選択</span>
            <button type="button" onClick={() => setItemPanelOpen(false)} className="text-xs text-content-muted">
              閉じる ✕
            </button>
          </div>
          {battle.player.items.filter((i) => i.count > 0).length === 0 ? (
            <p className="text-xs text-content-muted">アイテムなし</p>
          ) : (
            battle.player.items
              .filter((i) => i.count > 0)
              .map((i) => (
                <button
                  key={i.code}
                  type="button"
                  disabled={inputLocked}
                  onClick={() => void sendAction({ type: 'item', itemCode: i.code })}
                  className="flex items-center justify-between rounded-lg bg-surface-base px-3 py-2 text-left text-sm disabled:opacity-40"
                >
                  <span>{i.code}</span>
                  <span className="text-content-muted">×{i.count}</span>
                </button>
              ))
          )}
        </div>
      ) : null}

      {/* コマンド */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={inputLocked || targetMode !== null}
          onClick={startAttack}
          className="h-12 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
        >
          ⚔ 攻撃
        </button>
        <button
          type="button"
          disabled={inputLocked || targetMode !== null}
          onClick={() => {
            setSkillPanelOpen((v) => !v);
            setItemPanelOpen(false);
          }}
          className="h-12 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
        >
          ✦ スキル
        </button>
        <button
          type="button"
          disabled={inputLocked || targetMode !== null}
          onClick={() => void sendAction({ type: 'guard' })}
          className="h-12 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
        >
          🛡 防御
        </button>
        <button
          type="button"
          disabled={inputLocked || targetMode !== null}
          onClick={() => {
            setItemPanelOpen((v) => !v);
            setSkillPanelOpen(false);
          }}
          className="h-12 rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
        >
          🎒 アイテム
        </button>
      </div>
      {battle.canFlee ? (
        <button
          type="button"
          disabled={inputLocked || targetMode !== null}
          onClick={() => void sendAction({ type: 'flee' })}
          className="h-11 rounded-lg border border-damage/60 text-sm text-damage disabled:opacity-50"
        >
          🏃 逃走 {battle.fleeChance !== null ? `(${battle.fleeChance}%)` : ''}
        </button>
      ) : null}

      {/* 戦闘終了オーバーレイ */}
      {endOverlay ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent-gold/60 bg-surface-raised p-5 text-center">
          <p className="text-xl font-bold text-accent-gold">
            {endOverlay.result === 'win'
              ? '勝利！'
              : endOverlay.result === 'lose'
                ? '敗北…'
                : '逃走成功'}
          </p>
          {endOverlay.reward ? (
            <p className="text-sm text-content-muted">
              獲得ゴールド {endOverlay.reward.gold}G / 獲得EXP {endOverlay.reward.exp}
            </p>
          ) : null}
          {endOverlay.levelUp ? (
            <p className="text-sm text-accent-gold">レベルアップ！（+{endOverlay.levelUp.levels}）</p>
          ) : null}
          {endOverlay.runStatus === 'cleared' ? (
            <p className="text-lg font-bold text-accent-gold">ダンジョンクリア！</p>
          ) : endOverlay.runStatus === 'failed' ? (
            <p className="text-sm text-content-muted">冒険は終了しました</p>
          ) : null}
          <button
            type="button"
            onClick={returnToMap}
            className="mx-auto flex h-12 w-full max-w-[280px] items-center justify-center rounded-lg bg-primary font-semibold text-white"
          >
            マップに戻る
          </button>
        </div>
      ) : null}
    </main>
  );
}
