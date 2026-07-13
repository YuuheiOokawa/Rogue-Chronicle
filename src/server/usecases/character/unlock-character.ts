import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

import { CHARACTERS } from '@/constants/masters';
import { canAffordUnlock, evaluateShardUnlock } from '@/domain/progression/unlock-condition';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';

/**
 * API-203 キャラクター解放（docs/13 §4.3）。
 * 1トランザクションで player_currencies条件付き減算 → player_characters作成 →
 * currency_transactions記録（→ player_codex登録）を行う。
 * - unlock_condition.type='shards' のみ解放可（achievement型はERR_INVALID_ACTION）
 * - 同一Idempotency-Keyの再送は currency_transactions.idempotency_key UNIQUEで検知し、
 *   保存済みの成功応答相当を返す
 */
export interface UnlockCharacterResult {
  characterCode: string;
  soulShards: number;
  /** 同一Idempotency-Key再送の再生応答か */
  replayed: boolean;
}

interface UnlockCharacterParams {
  userId: string;
  characterCode: string;
  idempotencyKey: string;
}

export async function unlockCharacter(
  params: UnlockCharacterParams,
): Promise<UnlockCharacterResult> {
  const { userId, characterCode, idempotencyKey } = params;

  const character = CHARACTERS.find((c) => c.code === characterCode);
  if (!character) {
    throw new AppError('ERR_NOT_FOUND', 'キャラクターが見つかりません');
  }

  const evaluation = evaluateShardUnlock(character.unlockCondition);
  if (!evaluation.purchasable) {
    throw new AppError(
      'ERR_INVALID_ACTION',
      evaluation.reason === 'achievement_locked'
        ? 'このキャラクターは実績で解放されます'
        : 'このキャラクターは解放操作の対象外です',
    );
  }
  const cost = evaluation.cost;

  // 同一Idempotency-Keyの再送: 保存済みの成功結果をそのまま返す（新規処理の前に確認する）
  const replayed = await findReplayedResult(userId, characterCode, idempotencyKey);
  if (replayed) return replayed;

  // 二重解放の事前検知（Tx内のUNIQUE違反はレースの最終防壁）
  const already = await prisma.playerCharacter.findUnique({
    where: { userId_characterCode: { userId, characterCode } },
  });
  if (already) {
    throw new AppError('ERR_REWARD_ALREADY_CLAIMED', 'このキャラクターは解放済みです');
  }

  try {
    const soulShards = await prisma.$transaction(async (tx) => {
      // 条件付きUPDATE（残高>=コスト、version+1の楽観ロック更新）
      const updated = await tx.playerCurrency.updateMany({
        where: { userId, soulShards: { gte: cost } },
        data: { soulShards: { decrement: cost }, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        // 0行→再読込して残高不足を確定させる
        const current = await tx.playerCurrency.findUnique({ where: { userId } });
        if (!current || !canAffordUnlock(character.unlockCondition, current.soulShards)) {
          throw new AppError('ERR_INSUFFICIENT_SHARDS', undefined, {
            required: cost,
            current: current?.soulShards ?? 0,
          });
        }
        throw new AppError('ERR_INTERNAL'); // 残高は足りるのに更新0行（想定外）
      }

      const balance = await tx.playerCurrency.findUniqueOrThrow({ where: { userId } });

      await tx.playerCharacter.create({ data: { userId, characterCode } });

      await tx.currencyTransaction.create({
        data: {
          id: uuidv7(),
          userId,
          currency: 'soul_shards',
          amount: -cost,
          balanceAfter: balance.soulShards,
          reason: 'character_unlock',
          refId: characterCode,
          idempotencyKey,
        },
      });

      // 図鑑登録（docs/13 API-203 手順5）
      await tx.playerCodex.createMany({
        data: [{ userId, entryType: 'character', entryCode: characterCode }],
        skipDuplicates: true,
      });

      return balance.soulShards;
    });

    return { characterCode, soulShards, replayed: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta.target as string[]).join(',')
        : String(err.meta?.target ?? '');
      if (target.includes('idempotency_key')) {
        // 同一キーの並行再送: 先勝ちの保存済み結果を返す
        const saved = await findReplayedResult(userId, characterCode, idempotencyKey);
        if (saved) return saved;
        throw new AppError('ERR_DUPLICATE_REQUEST');
      }
      if (target.includes('character_code')) {
        throw new AppError('ERR_REWARD_ALREADY_CLAIMED', 'このキャラクターは解放済みです');
      }
    }
    throw err;
  }
}

/** 保存済みcurrency_transactionsから同一キーの成功応答を復元する */
async function findReplayedResult(
  userId: string,
  characterCode: string,
  idempotencyKey: string,
): Promise<UnlockCharacterResult | null> {
  const saved = await prisma.currencyTransaction.findUnique({ where: { idempotencyKey } });
  if (!saved) return null;
  if (
    saved.userId !== userId ||
    saved.reason !== 'character_unlock' ||
    saved.refId !== characterCode
  ) {
    // 別操作でのキー使い回しは再生できない
    throw new AppError('ERR_DUPLICATE_REQUEST', '同じIdempotency-Keyが別の操作で使用されています');
  }
  return { characterCode, soulShards: saved.balanceAfter, replayed: true };
}
