import { v7 as uuidv7 } from 'uuid';

import { ACHIEVEMENTS, CHARACTERS, ENEMIES, EQUIPMENT, RELICS, SKILLS } from '@/constants/masters';
import { validateRunState, type RunState } from '@/domain/dungeon/run-state';
import {
  codexKey,
  grantPersistentRewards,
  type CodexEntry,
  type CodexEntryType,
  type GrantRewardsMasters,
  type PlayerPersistentData,
  type RunOutcome,
} from '@/domain/progression/grant-rewards';
import { AppError } from '@/server/services/errors';
import { prisma, type JsonInput } from '@/server/services/prisma';
import { hashRequest } from '@/server/usecases/shared/run-mutation';

/**
 * API-307 リザルト確定（finalize、docs/13 §4.4・最重要）。
 * withActiveRunMutation は status='active' 限定のヘルパのため使えず（対象はcleared/failed/
 * retiredのラン）、ここで同等の冪等キー確認・楽観ロック・保存パターンを独自実装する。
 *
 * 二重finalize防止の要（最重要要件）: `UPDATE dungeon_runs SET status='finalized' WHERE
 * id=? AND version=? AND status IN ('cleared','failed','retired')` を報酬付与より前に実行し、
 * 0行なら（=version不一致 or 既に他のリクエストがfinalize済み）その場でロールバックし、
 * それ以降の付与処理（ソウルシャード加算・player_progress更新・図鑑/実績INSERT）を一切行わない。
 */

const FINAL_STATUSES = ['cleared', 'failed', 'retired'] as const;

const MASTERS: GrantRewardsMasters = {
  achievements: ACHIEVEMENTS,
  skills: SKILLS,
  relics: RELICS,
  enemies: ENEMIES,
  equipment: EQUIPMENT,
  characters: CHARACTERS,
};

export interface FinalizeResponseBody {
  finalStatus: RunOutcome;
  runStatus: 'finalized';
  reachedFloor: number;
  soulShards: { granted: number; balance: number };
  rank: { before: number; after: number; rankExp: number; rankUps: number };
  stats: {
    kills: number;
    eliteKills: number;
    totalRuns: number;
    totalClears: number;
    totalDefeats: number;
    totalKills: number;
    bestFloor: number;
  };
  newCodexEntries: CodexEntry[];
  unlockedAchievements: { code: string; name: string }[];
  unlockedCharacters: { code: string; name: string }[];
}

export interface FinalizeRunParams {
  userId: string;
  idempotencyKey: string;
  expectedVersion: number;
}

export interface FinalizeRunResult {
  response: FinalizeResponseBody;
  version: number;
  /** 冪等再送で保存済み応答を返した場合true */
  replayed: boolean;
}

function isFinalOutcome(status: string): status is RunOutcome {
  return (FINAL_STATUSES as readonly string[]).includes(status);
}

export async function finalizeRun(params: FinalizeRunParams): Promise<FinalizeRunResult> {
  const { userId, idempotencyKey, expectedVersion } = params;

  // 対象ランの特定: status問わず直近1件（GET /api/v1/runs/current=API-304と同じ方針）。
  // status='active'ならまだ終了していない、'finalized'なら既に受領済み。
  const run = await prisma.dungeonRun.findFirst({
    where: { userId },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) throw new AppError('ERR_NOT_FOUND', '対象の冒険が見つかりません');

  if (run.status === 'active') {
    throw new AppError('ERR_RUN_STATE_INVALID', 'この冒険はまだ終了していません');
  }

  let state: RunState;
  try {
    state = validateRunState(run.runState);
  } catch {
    throw new AppError('ERR_RUN_STATE_INVALID', '冒険データに問題が見つかりました');
  }

  const requestHash = hashRequest({ version: expectedVersion });

  // 冪等キー確認（保存済み応答の再送。finalized済みランはここでしか正常応答を返せない）
  if (state.lastRequest?.key === idempotencyKey) {
    if (state.lastRequest.requestHash !== requestHash) {
      throw new AppError('ERR_DUPLICATE_REQUEST', '同じ操作キーで異なる内容が送信されました');
    }
    return {
      response: state.lastRequest.responseBody as FinalizeResponseBody,
      version: run.version,
      replayed: true,
    };
  }

  if (run.status === 'finalized') {
    // 既にfinalize済み、かつ今回のキーとは一致しない = 別操作としての再実行はできない
    throw new AppError('ERR_REWARD_ALREADY_CLAIMED');
  }
  if (!isFinalOutcome(run.status)) {
    // 理論上到達しない（active/finalized以外はcleared/failed/retiredのみ）
    throw new AppError('ERR_RUN_STATE_INVALID');
  }
  const outcome: RunOutcome = run.status;

  // 楽観ロック事前検証（最終防衛線はTx内の条件付きUPDATE）
  if (run.version !== expectedVersion) {
    throw new AppError('ERR_CONFLICT_VERSION', undefined, { currentVersion: run.version });
  }

  const response = await prisma.$transaction(async (tx) => {
    // d. 条件付きUPDATE（二重finalize防止の最終防衛線）。0行なら以降の付与処理を一切行わない。
    const updated = await tx.dungeonRun.updateMany({
      where: { id: run.id, version: expectedVersion, status: { in: [...FINAL_STATUSES] } },
      data: { status: 'finalized', version: { increment: 1 }, endedAt: new Date() },
    });
    if (updated.count === 0) {
      const current = await tx.dungeonRun.findUnique({ where: { id: run.id } });
      if (!current) throw new AppError('ERR_NOT_FOUND');
      if (current.version !== expectedVersion) {
        throw new AppError('ERR_CONFLICT_VERSION', undefined, { currentVersion: current.version });
      }
      throw new AppError('ERR_REWARD_ALREADY_CLAIMED');
    }

    // a. 永続データ読み込み（player_progress / player_currencies / player_codex /
    //    player_achievements / player_characters）
    const [progress, currency, codexRows, achievementRows, characterRows] = await Promise.all([
      tx.playerProgress.findUnique({ where: { userId } }),
      tx.playerCurrency.findUnique({ where: { userId } }),
      tx.playerCodex.findMany({ where: { userId } }),
      tx.playerAchievement.findMany({ where: { userId } }),
      tx.playerCharacter.findMany({ where: { userId } }),
    ]);
    if (!progress || !currency) {
      throw new AppError('ERR_INTERNAL', 'プレイヤーデータが見つかりません');
    }

    const player: PlayerPersistentData = {
      progress: {
        rank: progress.rank,
        rankExp: progress.rankExp,
        totalRuns: progress.totalRuns,
        totalClears: progress.totalClears,
        totalDefeats: progress.totalDefeats,
        totalKills: progress.totalKills,
        eliteKills: progress.eliteKills,
        bestFloor: progress.bestFloor,
      },
      codex: new Set(
        codexRows.map((c) =>
          codexKey({ entryType: c.entryType as CodexEntryType, entryCode: c.entryCode }),
        ),
      ),
      achievements: new Set(achievementRows.map((a) => a.achievementCode)),
      characters: new Set(characterRows.map((c) => c.characterCode)),
    };

    // c. grantPersistentRewards（純関数。domain/progression/grant-rewards.ts、変更禁止）
    const grant = grantPersistentRewards(state, outcome, player, MASTERS, run.id);

    // e. currency_transactions INSERT + player_currencies加算（条件付きUPDATE、version+1）
    //    amount=0のtransactionはDB CHECK(amount<>0)に抵触するため挿入しない（残高加算も実質0で無害）。
    for (const txn of grant.transactions) {
      if (txn.amount === 0) continue;
      await tx.currencyTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          currency: txn.currency,
          amount: txn.amount,
          balanceAfter: currency.soulShards + txn.amount,
          reason: txn.reason,
          refId: txn.refId,
          idempotencyKey,
        },
      });
    }
    const currencyUpdate = await tx.playerCurrency.updateMany({
      where: { userId, version: currency.version },
      data: { soulShards: { increment: grant.soulShards }, version: { increment: 1 } },
    });
    if (currencyUpdate.count === 0) {
      throw new AppError('ERR_CONFLICT_VERSION', '通貨残高が他の操作で更新されています');
    }
    const balance = await tx.playerCurrency.findUniqueOrThrow({ where: { userId } });

    // f. player_progress更新（rank/rankExp/累計統計。条件付きUPDATE、version+1）
    const progressUpdate = await tx.playerProgress.updateMany({
      where: { userId, version: progress.version },
      data: {
        rank: grant.progress.rank,
        rankExp: grant.progress.rankExp,
        totalRuns: grant.progress.totalRuns,
        totalClears: grant.progress.totalClears,
        totalDefeats: grant.progress.totalDefeats,
        totalKills: grant.progress.totalKills,
        eliteKills: grant.progress.eliteKills,
        bestFloor: grant.progress.bestFloor,
        version: { increment: 1 },
      },
    });
    if (progressUpdate.count === 0) {
      throw new AppError('ERR_CONFLICT_VERSION', 'プレイヤー進行状況が他の操作で更新されています');
    }

    // g. player_codex 一括INSERT（ON CONFLICT DO NOTHING相当）
    if (grant.codexDiff.length > 0) {
      await tx.playerCodex.createMany({
        data: grant.codexDiff.map((e) => ({ userId, entryType: e.entryType, entryCode: e.entryCode })),
        skipDuplicates: true,
      });
    }

    // h. player_achievements 一括INSERT
    if (grant.unlockedAchievements.length > 0) {
      await tx.playerAchievement.createMany({
        data: grant.unlockedAchievements.map((code) => ({ userId, achievementCode: code })),
        skipDuplicates: true,
      });
    }

    // i. player_characters 一括INSERT（実績連動解放）
    if (grant.unlockedCharacters.length > 0) {
      await tx.playerCharacter.createMany({
        data: grant.unlockedCharacters.map((code) => ({ userId, characterCode: code })),
        skipDuplicates: true,
      });
    }

    const body: FinalizeResponseBody = {
      finalStatus: outcome,
      runStatus: 'finalized',
      reachedFloor: state.position.floor,
      soulShards: { granted: grant.soulShards, balance: balance.soulShards },
      rank: {
        before: player.progress.rank,
        after: grant.progress.rank,
        rankExp: grant.progress.rankExp,
        rankUps: grant.rankLeveledUp,
      },
      stats: {
        kills: state.earned.kills,
        eliteKills: state.earned.eliteKills,
        totalRuns: grant.progress.totalRuns,
        totalClears: grant.progress.totalClears,
        totalDefeats: grant.progress.totalDefeats,
        totalKills: grant.progress.totalKills,
        bestFloor: grant.progress.bestFloor,
      },
      newCodexEntries: grant.codexDiff,
      unlockedAchievements: grant.unlockedAchievements.map((code) => ({
        code,
        name: ACHIEVEMENTS.find((a) => a.code === code)?.name ?? code,
      })),
      unlockedCharacters: grant.unlockedCharacters.map((code) => ({
        code,
        name: CHARACTERS.find((c) => c.code === code)?.name ?? code,
      })),
    };

    // j. run_state.lastRequestを更新した上でrun_stateを保存（冪等応答の再送用）
    const nextState: RunState = {
      ...state,
      lastRequest: {
        key: idempotencyKey,
        apiId: 'API-307',
        requestHash,
        status: 'completed',
        responseBody: body,
        savedAt: new Date().toISOString(),
      },
    };
    await tx.dungeonRun.update({
      where: { id: run.id },
      data: { runState: nextState as unknown as JsonInput },
    });

    return body;
  });

  return { response, version: run.version + 1, replayed: false };
}
