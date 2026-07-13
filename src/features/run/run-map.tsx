'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { FormError, usePending } from '@/components/auth-form';
import type { RunView as ServerRunView } from '@/server/usecases/run/run-view';

/** SCR-301 ダンジョンマップ（列グラフ・縦スクロール。docs/09 §4.6） */

interface MapNodeView {
  id: string;
  floor: number;
  type: string;
  next: string[];
}
interface RunView {
  runId: string;
  dungeonCode: string;
  status: string;
  version: number;
  map: MapNodeView[][];
  position: { floor: number; nodeId: string | null; phase: string };
  visited: string[];
  selectable: string[];
  character: {
    code: string;
    level: number;
    hp: number;
    sp: number;
    maxSp: number;
    stats: { maxHp: number };
  };
  gold: number;
  earned: { soulShards: number; rankExp: number; kills: number };
}

const NODE_LABEL: Record<string, string> = {
  BATTLE: '戦闘',
  STRONG: '強敵',
  ELITE: '精鋭',
  BOSS: 'ボス',
  TREASURE: '宝箱',
  SHOP: '商店',
  REST: '休憩',
  EVENT: '？',
  BLESS: '祝福',
  HEAL: '回復',
  CURSE: '呪い',
  STORY: '物語',
  SECRET: '隠し',
};

export function RunMap({ initialView }: { initialView: ServerRunView }) {
  const router = useRouter();
  const [view, setView] = useState<RunView>(initialView as unknown as RunView);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [pending, run] = usePending();

  // 操作後の再取得（初期表示はサーバーコンポーネントから受け取る）
  const load = useCallback(async (): Promise<RunView | undefined> => {
    const res = await fetch('/api/v1/runs/current');
    if (res.status === 404) {
      router.push('/dungeons');
      return undefined;
    }
    if (!res.ok) {
      setError('冒険データの取得に失敗しました。再読み込みしてください。');
      return undefined;
    }
    const next = (await res.json()) as RunView;
    setView(next);
    return next;
  }, [router]);

  const selectNode = (nodeId: string) =>
    run(async () => {
      if (!view) return;
      setError(null);
      const res = await fetch('/api/v1/runs/current/select-node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(), // 操作ごとに生成。リトライ時は同一キー再送（docs/15）
        },
        body: JSON.stringify({ version: view.version, nodeId }),
      });
      const body = (await res.json().catch(() => null)) as {
        errorCode?: string;
        message?: string;
        node?: { type: string; floor: number };
        cleared?: boolean;
      } | null;
      if (!res.ok) {
        if (body?.errorCode === 'ERR_CONFLICT_VERSION') {
          // 他端末等で更新済み → 最新状態へ再同期（docs/07 異常系）
          await load();
          setError('データが更新されていたため、最新の状態に同期しました。');
          return;
        }
        setError(body?.message ?? '移動に失敗しました');
        return;
      }
      const nodeType = body?.node?.type ?? '';
      const isBattleNode = nodeType === 'BATTLE' || nodeType === 'STRONG' || nodeType === 'ELITE' || nodeType === 'BOSS';
      setLastResult(
        isBattleNode
          ? `${NODE_LABEL[nodeType] ?? ''}が発生！（階層${body?.node?.floor}）`
          : `${NODE_LABEL[nodeType] ?? ''}マスを通過（階層${body?.node?.floor}）`,
      );
      const next = await load();
      if (next?.position.phase === 'battle') {
        router.push('/run/battle');
      }
    });

  const retire = () =>
    run(async () => {
      if (!view) return;
      const ok = window.confirm(
        'リタイアしますか？\n冒険中に得たものは失われます（獲得済み記録の精算はPhase 8で実装予定）。',
      );
      if (!ok) return;
      const res = await fetch('/api/v1/runs/current/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ version: view.version }),
      });
      if (res.ok) {
        router.push('/home');
        return;
      }
      setError('リタイアに失敗しました');
    });

  const isEnded = view.status !== 'active';

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-6">
      {/* ステータスバー（HP/SP/ゴールド） */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg bg-surface-raised/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">
            階層 {view.position.floor}/{view.map.length}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-accent-gold">{view.gold}G</span>
            {!isEnded ? (
              <button
                type="button"
                onClick={retire}
                disabled={pending}
                className="rounded border border-damage/60 px-2 py-1 text-xs text-damage disabled:opacity-50"
              >
                リタイア
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-hp">
            HP {view.character.hp}/{view.character.stats.maxHp}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded bg-surface-base">
            <div
              className="h-full bg-hp"
              style={{ width: `${(view.character.hp / view.character.stats.maxHp) * 100}%` }}
            />
          </div>
          <span className="text-sp">
            SP {view.character.sp}/{view.character.maxSp}
          </span>
        </div>
      </header>

      <FormError message={error} />
      {lastResult ? (
        <p role="status" className="rounded-lg bg-surface-raised px-3 py-2 text-sm">
          {lastResult}
        </p>
      ) : null}

      {isEnded ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent-gold/60 bg-surface-raised p-5 text-center">
          <p className="text-xl font-bold text-accent-gold">
            {view.status === 'cleared' ? 'ダンジョンクリア！' : '冒険終了'}
          </p>
          <p className="text-sm text-content-muted">
            撃破 {view.earned.kills} / 獲得ランクEXP {view.earned.rankExp}
            <br />
            報酬の受け取り（ソウルシャード・実績）は Phase 8 で実装されます。
          </p>
          <Link
            href="/home"
            className="mx-auto flex h-12 w-full max-w-[280px] items-center justify-center rounded-lg bg-primary font-semibold text-white"
          >
            拠点へ戻る
          </Link>
        </div>
      ) : null}

      {/* マップ本体: 階層を下から上へ（階層1が最下段） */}
      <div className="flex flex-col-reverse gap-3 pb-8">
        {view.map.map((floorNodes, fi) => (
          <section key={fi} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-right font-mono text-xs text-content-muted">
              {fi + 1}F
            </span>
            <div className="flex flex-1 justify-around gap-2">
              {floorNodes.map((node) => {
                const isCurrent = view.position.nodeId === node.id;
                const isVisited = view.visited.includes(node.id);
                const isSelectable = !isEnded && view.selectable.includes(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    disabled={!isSelectable || pending}
                    onClick={() => selectNode(node.id)}
                    aria-label={`階層${node.floor} ${NODE_LABEL[node.type] ?? node.type}${
                      isCurrent ? '（現在地）' : isSelectable ? '（選択可能）' : ''
                    }`}
                    className={[
                      'flex h-12 min-w-12 flex-1 items-center justify-center rounded-lg text-xs font-semibold transition-all',
                      node.type === 'BOSS' ? 'text-damage' : '',
                      isCurrent
                        ? 'bg-primary text-white ring-2 ring-accent-gold'
                        : isSelectable
                          ? 'animate-pulse bg-surface-raised ring-2 ring-primary'
                          : isVisited
                            ? 'bg-surface-raised/40 text-content-muted line-through'
                            : 'bg-surface-raised text-content-muted',
                    ].join(' ')}
                  >
                    {NODE_LABEL[node.type] ?? node.type}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
