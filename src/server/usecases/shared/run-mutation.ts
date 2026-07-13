import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { validateRunState, type RunState } from '@/domain/dungeon/run-state';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';

/**
 * ラン系変更APIの共通処理（docs/20 §1.9.6〜1.9.7 / CLAUDE.md 絶対ルール4）。
 * 順序: 冪等キー確認 → version検証（楽観ロック）→（呼び出し側で）正当性検証・domain解決 → 保存。
 *
 * - 冪等性: run_state.lastRequest に直近1件の {key, requestHash, responseBody} を保持。
 *   同一キー+同一ボディ → 保存済み応答を再送（処理は再実行しない）
 *   同一キー+異なるボディ → ERR_DUPLICATE_REQUEST(409)
 * - 楽観ロック: UPDATE ... WHERE version = expected。0行なら ERR_CONFLICT_VERSION(409)
 * - スナップショット: options.snapshot=true でノード開始時点を保存（直近3世代、docs/15）
 */

const SNAPSHOT_GENERATIONS = 3;

export interface RunMutationInput {
  userId: string;
  apiId: string;
  idempotencyKey: string;
  requestBody: unknown;
  expectedVersion: number;
}

export interface RunMutationResult<T> {
  response: T;
  version: number;
  /** 冪等再送で保存済み応答を返した場合true */
  replayed: boolean;
}

interface MutationOutcome<T> {
  nextState: RunState;
  response: T;
  /** ランのstatus遷移（省略時はactiveのまま） */
  nextStatus?: 'active' | 'cleared' | 'failed' | 'retired';
  snapshot?: boolean;
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body) ?? 'null').digest('hex');
}

export async function withActiveRunMutation<T>(
  input: RunMutationInput,
  mutate: (state: RunState, run: { id: string; dungeonCode: string; seed: bigint }) => MutationOutcome<T>,
): Promise<RunMutationResult<T>> {
  const run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: 'active' },
  });
  if (!run) throw new AppError('ERR_NOT_FOUND', '進行中の冒険がありません');

  let state: RunState;
  try {
    state = validateRunState(run.runState);
  } catch {
    throw new AppError('ERR_RUN_STATE_INVALID', '冒険データに問題が見つかりました');
  }

  const requestHash = hashRequest(input.requestBody);

  // 冪等キー確認（保存済み応答の再送）
  if (state.lastRequest?.key === input.idempotencyKey) {
    if (state.lastRequest.requestHash !== requestHash) {
      throw new AppError('ERR_DUPLICATE_REQUEST', '同じ操作キーで異なる内容が送信されました');
    }
    return {
      response: state.lastRequest.responseBody as T,
      version: run.version,
      replayed: true,
    };
  }

  // 楽観ロック（事前検証。最終防衛線は条件付きUPDATE）
  if (run.version !== input.expectedVersion) {
    throw new AppError('ERR_CONFLICT_VERSION', undefined, { currentVersion: run.version });
  }

  const outcome = mutate(state, {
    id: run.id,
    dungeonCode: run.dungeonCode,
    seed: run.seed,
  });

  const nextState: RunState = {
    ...outcome.nextState,
    lastRequest: {
      key: input.idempotencyKey,
      apiId: input.apiId,
      requestHash,
      status: 'completed',
      responseBody: outcome.response,
      savedAt: new Date().toISOString(),
    },
  };
  const nextStatus = outcome.nextStatus ?? 'active';

  await prisma.$transaction(async (tx) => {
    const updated = await tx.dungeonRun.updateMany({
      where: { id: run.id, version: input.expectedVersion },
      data: {
        runState: nextState as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
        status: nextStatus,
        endedAt: nextStatus === 'active' ? null : new Date(),
      },
    });
    if (updated.count === 0) {
      // 同時リクエストに敗北（docs/12 §5.4 の最終防衛線）
      throw new AppError('ERR_CONFLICT_VERSION');
    }
    if (outcome.snapshot) {
      const generation = run.version + 1;
      await tx.dungeonRunSnapshot.create({
        data: {
          runId: run.id,
          generation,
          runState: nextState as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.dungeonRunSnapshot.deleteMany({
        where: { runId: run.id, generation: { lte: generation - SNAPSHOT_GENERATIONS } },
      });
    }
  });

  return { response: outcome.response, version: run.version + 1, replayed: false };
}

/** Idempotency-Keyヘッダの取得（ラン系変更APIは必須。docs/13 §2） */
export function requireIdempotencyKey(req: Request): string {
  const key = req.headers.get('idempotency-key');
  if (!key || key.length < 8 || key.length > 128) {
    throw new AppError('ERR_VALIDATION', 'Idempotency-Keyヘッダが必要です');
  }
  return key;
}
