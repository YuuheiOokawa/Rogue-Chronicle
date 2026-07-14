import { useQuery } from '@tanstack/react-query';

import { apiGet, ApiClientError } from '@/lib/api-client';

/**
 * SCR-401/402/403/314共通: GET /api/v1/runs/current（API-304）の最小表示View。
 * 完全な RunView 型（src/server/usecases/run/run-view.ts）には依存せず、この画面群が
 * 必要とするフィールドだけを局所定義する（run-map.tsx / battle-screen.tsx と同じ方針。
 * 並行実装中の select-node.ts / run-view.ts 側の型変更に巻き込まれないための意図的な疎結合）。
 *
 * 注意（既知の制約）: API-304は status IN (active/cleared/failed/retired) のランのみを返す
 * （finalized済みは対象外）。そのためfinalize完了後にこの画面群へ再訪すると404になる。
 * 本タスクの範囲ではAPI-304を拡張せず、404時はホームへ誘導する（結果画面はfinalize直後の
 * 一度きりの表示という前提。docs/09 SCR-403想定フローと整合）。
 */
export interface RunCurrentView {
  runId: string;
  status: string;
  version: number;
  position: { floor: number; nodeId: string | null; phase: string };
  character: { code: string; level: number };
  earned: { soulShards: number; rankExp: number; kills: number; eliteKills: number };
}

export function useRunCurrentQuery() {
  return useQuery({
    queryKey: ['run-current'],
    queryFn: () => apiGet<RunCurrentView>('/api/v1/runs/current'),
    retry: (failureCount, err) => {
      if (err instanceof ApiClientError && err.status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 404;
}
