// API-204 永続強化のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして各APIを呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => ({ userId: mockUserId, isGuest: true, role: 'user' }),
}));

import { prisma } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';

import { GET, POST } from './route';
import type { UpgradePurchaseResponse, UpgradesResponse } from './route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/player/upgrades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!runDbTests)('API-204 永続強化（DB統合）', () => {
  const createdUserIds: string[] = [];

  async function createTestUser(soulShards: number): Promise<string> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;
    await prisma.playerCurrency.update({ where: { userId: user.id }, data: { soulShards } });
    return user.id;
  }

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it('GET: 新規ユーザーは全12ノードrank0・upg_hp_1等の前提無しノードのみunlockable', async () => {
    await createTestUser(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as UpgradesResponse;

    expect(body.items).toHaveLength(12);
    expect(body.soulShards).toBe(0);
    expect(body.totalBonusPct).toEqual({ hp: 0, atk: 0, capPct: 30 });

    const hp1 = body.items.find((i) => i.code === 'upg_hp_1')!;
    expect(hp1).toMatchObject({ rank: 0, maxRank: 1, unlockable: true, prerequisiteCode: null });

    const hp2 = body.items.find((i) => i.code === 'upg_hp_2')!;
    expect(hp2).toMatchObject({ rank: 0, unlockable: false, prerequisiteCode: 'upg_hp_1' });
  });

  it('POST: 購入成功でrankが上がり、通貨が減算され、currency_transactionsが記録される', async () => {
    await createTestUser(500);

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 1 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as UpgradePurchaseResponse;
    expect(body).toEqual({
      upgradeNodeCode: 'upg_hp_1',
      rank: 1,
      maxRank: 1,
      currencies: { soulShards: 400 }, // 500 - 100(upg_hp_1のコスト)
    });

    const saved = await prisma.playerUpgrade.findUniqueOrThrow({
      where: { userId_upgradeNodeCode: { userId: mockUserId, upgradeNodeCode: 'upg_hp_1' } },
    });
    expect(saved.rank).toBe(1);

    const currency = await prisma.playerCurrency.findUniqueOrThrow({
      where: { userId: mockUserId },
    });
    expect(currency.soulShards).toBe(400);

    const tx = await prisma.currencyTransaction.findFirstOrThrow({
      where: { userId: mockUserId, reason: 'upgrade' },
    });
    expect(tx).toMatchObject({
      currency: 'soul_shards',
      amount: -100,
      balanceAfter: 400,
      refId: 'upg_hp_1',
    });
  });

  it('前提ノード購入後に次段が購入可能になる（upg_hp_1→upg_hp_2）', async () => {
    await createTestUser(1000);
    await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 1 }));

    const listAfterFirst = (await (await GET()).json()) as UpgradesResponse;
    const hp2Before = listAfterFirst.items.find((i) => i.code === 'upg_hp_2')!;
    expect(hp2Before.unlockable).toBe(true);

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_2', targetRank: 1 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as UpgradePurchaseResponse;
    expect(body.rank).toBe(1);

    const currency = await prisma.playerCurrency.findUniqueOrThrow({
      where: { userId: mockUserId },
    });
    expect(currency.soulShards).toBe(1000 - 100 - 250); // upg_hp_1 + upg_hp_2
  });

  it('前提未達（upg_hp_2をupg_hp_1未購入で購入） → ERR_INVALID_ACTION(422)', async () => {
    await createTestUser(1000);

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_2', targetRank: 1 }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_INVALID_ACTION');
  });

  it('購入済みノードの再購入 → ERR_REWARD_ALREADY_CLAIMED(409)。残高は二重に減らない', async () => {
    await createTestUser(1000);
    await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 1 }));

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 1 }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_REWARD_ALREADY_CLAIMED');

    const currency = await prisma.playerCurrency.findUniqueOrThrow({
      where: { userId: mockUserId },
    });
    expect(currency.soulShards).toBe(900); // 1回目の-100のみ
  });

  it('残高不足 → ERR_INSUFFICIENT_SHARDS(422)、rank/残高とも変化しない', async () => {
    await createTestUser(50); // upg_hp_1のコスト100に満たない

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 1 }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_INSUFFICIENT_SHARDS');

    const currency = await prisma.playerCurrency.findUniqueOrThrow({
      where: { userId: mockUserId },
    });
    expect(currency.soulShards).toBe(50);
    const saved = await prisma.playerUpgrade.findUnique({
      where: { userId_upgradeNodeCode: { userId: mockUserId, upgradeNodeCode: 'upg_hp_1' } },
    });
    expect(saved).toBeNull();
  });

  it('存在しないノード → ERR_NOT_FOUND(404)', async () => {
    await createTestUser(1000);

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_unknown', targetRank: 1 }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_NOT_FOUND');
  });

  it('飛ばし購入（targetRank=2をrank0から） → ERR_INVALID_ACTION(422)', async () => {
    await createTestUser(1000);

    const res = await POST(postRequest({ upgradeNodeCode: 'upg_hp_1', targetRank: 2 }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_INVALID_ACTION');
  });
});
