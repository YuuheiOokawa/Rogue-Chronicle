// API-203 キャラクター解放のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';
import { unlockCharacter } from '@/server/usecases/character/unlock-character';

const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDbTests)('unlockCharacter（DB統合）', () => {
  const createdUserIds: string[] = [];

  async function createTestUser(soulShards: number): Promise<string> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    await prisma.playerCurrency.update({
      where: { userId: user.id },
      data: { soulShards },
    });
    return user.id;
  }

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it('解放成功: 残高が減り、player_characters と currency_transactions が記録される', async () => {
    const userId = await createTestUser(300);
    const key = crypto.randomUUID();

    const result = await unlockCharacter({
      userId,
      characterCode: 'mage_lilia',
      idempotencyKey: key,
    });
    expect(result).toEqual({ characterCode: 'mage_lilia', soulShards: 0, replayed: false });

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(0);
    expect(currency.version).toBe(1); // 楽観ロックversion+1

    const unlocked = await prisma.playerCharacter.findUnique({
      where: { userId_characterCode: { userId, characterCode: 'mage_lilia' } },
    });
    expect(unlocked).not.toBeNull();

    const tx = await prisma.currencyTransaction.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(tx).toMatchObject({
      userId,
      currency: 'soul_shards',
      amount: -300,
      balanceAfter: 0,
      reason: 'character_unlock',
      refId: 'mage_lilia',
    });

    const codex = await prisma.playerCodex.findUnique({
      where: {
        userId_entryType_entryCode: { userId, entryType: 'character', entryCode: 'mage_lilia' },
      },
    });
    expect(codex).not.toBeNull();
  });

  it('同一Idempotency-Key再送: 保存済み成功応答相当を返し、残高は二重に減らない', async () => {
    const userId = await createTestUser(500);
    const key = crypto.randomUUID();

    await unlockCharacter({ userId, characterCode: 'mage_lilia', idempotencyKey: key });
    const replay = await unlockCharacter({
      userId,
      characterCode: 'mage_lilia',
      idempotencyKey: key,
    });

    expect(replay).toEqual({ characterCode: 'mage_lilia', soulShards: 200, replayed: true });

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(200); // 500 - 300 のまま

    const txCount = await prisma.currencyTransaction.count({
      where: { userId, reason: 'character_unlock' },
    });
    expect(txCount).toBe(1);
  });

  it('二重解放（別キー）: ERR_REWARD_ALREADY_CLAIMED(409)', async () => {
    const userId = await createTestUser(1000);

    await unlockCharacter({
      userId,
      characterCode: 'mage_lilia',
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      unlockCharacter({ userId, characterCode: 'mage_lilia', idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ errorCode: 'ERR_REWARD_ALREADY_CLAIMED', status: 409 });

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(700); // 2回目は減算されない
  });

  it('残高不足: ERR_INSUFFICIENT_SHARDS(422) で残高・解放状態が変わらない', async () => {
    const userId = await createTestUser(299);

    await expect(
      unlockCharacter({ userId, characterCode: 'mage_lilia', idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ errorCode: 'ERR_INSUFFICIENT_SHARDS', status: 422 });

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(299);
    const unlocked = await prisma.playerCharacter.findUnique({
      where: { userId_characterCode: { userId, characterCode: 'mage_lilia' } },
    });
    expect(unlocked).toBeNull();
  });

  it('achievement型（rogue_gald）はシャード購入不可: ERR_INVALID_ACTION(422)', async () => {
    const userId = await createTestUser(99999);

    await expect(
      unlockCharacter({ userId, characterCode: 'rogue_gald', idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ errorCode: 'ERR_INVALID_ACTION', status: 422 });
  });

  it('存在しないキャラ: ERR_NOT_FOUND(404)', async () => {
    const userId = await createTestUser(0);

    await expect(
      unlockCharacter({
        userId,
        characterCode: 'unknown_hero',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ errorCode: 'ERR_NOT_FOUND', status: 404 });
  });
});
