// 報酬フロー（API-501〜508）のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
// 代表的な3フロー: 宝箱→受領→run_state反映 / ショップ購入→gold減算 / イベント→効果反映。
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして各APIを呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => ({ userId: mockUserId, isGuest: true, role: 'user' }),
}));

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import type { NodeTypeCode } from '@/constants/masters/types';
import { createInitialRunState, type RunState } from '@/domain/dungeon/run-state';
import { selectNextNode } from '@/domain/dungeon/select-node';
import { createRng, generateDungeonSeed } from '@/domain/shared/rng';
import { prisma, type JsonInput } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';

import { POST as postEventChoose } from './event/choose/route';
import { POST as postShopPurchase } from './shop/purchase/route';
import { POST as postTreasureOpen } from './treasure/open/route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDbTests)('報酬フロー（DB統合・API-503/504/506）', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  /**
   * 単一ノード（指定したnodeType・floor）のみを持つカスタムマップでランを作成し、
   * そのノードへ入場した直後（pendingReward生成済み・phase='reward_pending'）の状態をDBへ保存する。
   */
  async function setupRunAtPendingReward(
    nodeType: NodeTypeCode,
    floor: number,
  ): Promise<{ userId: string; runId: string; state: RunState }> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;

    const dungeon = DUNGEONS[0];
    const character = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
    const seed = generateDungeonSeed(randomBytes(4).readUInt32LE(0));
    const rng = createRng(seed);
    const map = { seed, floors: [[{ id: 'f0n0', floor, type: nodeType, next: [] as string[] }]] };
    const initialState = createInitialRunState({
      map,
      character,
      equipment: { weapon: null, armor: null, accessory: null },
      rngCursor: rng.cursor,
    });
    // ゴールドを持たせておく（ショップ購入テスト用）
    const funded: RunState = { ...initialState, gold: 999 };

    const entered = selectNextNode(funded, 'f0n0');
    expect(entered.state.position.phase).toBe('reward_pending');

    const runId = randomUUID();
    await prisma.dungeonRun.create({
      data: {
        id: runId,
        userId: user.id,
        dungeonCode: dungeon.code,
        difficulty: 'normal',
        seed: BigInt(seed),
        status: 'active',
        runState: entered.state as unknown as JsonInput,
        version: 0,
      },
    });

    return { userId: user.id, runId, state: entered.state };
  }

  it('宝箱: TREASURE入場→API-503開封でrun_stateに反映される（claimed後pendingRewardはnull）', async () => {
    const { runId, state } = await setupRunAtPendingReward('TREASURE', 3);
    expect(state.pendingReward?.type).toBe('treasure');

    const req = new Request('http://localhost/api/v1/runs/current/treasure/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ version: 0 }),
    });
    const res = await postTreasureOpen(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: boolean; version: number; reward: { rewardType: string } };
    expect(body.claimed).toBe(true);
    expect(body.version).toBe(1);

    const run = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    const saved = run.runState as unknown as RunState;
    expect(saved.pendingReward).toBeNull();
    expect(saved.position.phase).toBe('map_select');
    // 宝箱の中身に応じてgold/items/relics/equipmentのいずれかが変化していること
    if (body.reward.rewardType === 'gold') expect(saved.gold).toBeGreaterThan(999);
    if (body.reward.rewardType === 'equipment') {
      expect(Object.values(saved.equipment)).toEqual(
        expect.arrayContaining([expect.any(String)]),
      );
    }
  });

  it('ショップ: SHOP入場→API-504購入でgoldが価格分減算され、slotがsoldOutになる', async () => {
    const { runId, state } = await setupRunAtPendingReward('SHOP', 4);
    const shopReward = state.pendingReward;
    if (shopReward?.type !== 'shop') throw new Error('expected shop pendingReward');
    const slot = shopReward.slots[0];
    expect(slot).toBeDefined();

    const req = new Request('http://localhost/api/v1/runs/current/shop/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ version: 0, action: 'purchase', slotIndex: slot!.slotIndex }),
    });
    const res = await postShopPurchase(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purchased: boolean; gold: number; cost: number };
    expect(body.purchased).toBe(true);
    expect(body.gold).toBe(999 - slot!.price);
    expect(body.cost).toBe(slot!.price);

    const run = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    const saved = run.runState as unknown as RunState;
    expect(saved.gold).toBe(999 - slot!.price);
    expect(saved.position.phase).toBe('reward_pending'); // 購入後もショップ滞在（繰り返し購入可能）
    if (saved.pendingReward?.type === 'shop') {
      const updatedSlot = saved.pendingReward.slots.find((s) => s.slotIndex === slot!.slotIndex);
      expect(updatedSlot?.soldOut).toBe(true);
    }

    // ゴールド不足での再購入はERR_INSUFFICIENT_GOLD（422）
    const secondSlot = shopReward.slots[1];
    const poorReq = new Request('http://localhost/api/v1/runs/current/shop/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ version: 1, action: 'purchase', slotIndex: secondSlot!.slotIndex }),
    });
    // 残高が十分な場合はスキップ相当のため価格を確認してから期待値を決める
    if (body.gold < secondSlot!.price) {
      const poorRes = await postShopPurchase(poorReq);
      expect(poorRes.status).toBe(422);
      const poorBody = (await poorRes.json()) as { errorCode: string };
      expect(poorBody.errorCode).toBe('ERR_INSUFFICIENT_GOLD');
    }
  });

  it('イベント: EVENT入場→API-506選択で効果が反映されpendingRewardがクローズする', async () => {
    const { runId, state } = await setupRunAtPendingReward('EVENT', 5);
    expect(state.pendingReward?.type).toBe('event');
    const eventReward = state.pendingReward!.type === 'event' ? state.pendingReward : undefined;
    expect(eventReward?.choices.length).toBeGreaterThan(0);

    // 最後の選択肢（多くのイベントで「立ち去る/賭けない」等の無害な選択肢）を選ぶ
    const choiceIndex = eventReward!.choices.length - 1;

    const req = new Request('http://localhost/api/v1/runs/current/event/choose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ version: 0, choiceIndex }),
    });
    const res = await postEventChoose(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resultText: string; position: { phase: string } };
    expect(body.resultText).toEqual(expect.any(String));

    const run = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    const saved = run.runState as unknown as RunState;
    // 選択後はbattle以外（map_select/reward_pending）へ遷移し、versionが進んでいること
    expect(['map_select', 'reward_pending']).toContain(saved.position.phase);
    expect(run.version).toBe(1);
  });

  it('冪等性: 同一Idempotency-Keyでの宝箱開封再送は副作用なく保存済み応答を返す', async () => {
    const { state } = await setupRunAtPendingReward('TREASURE', 3);
    expect(state.pendingReward?.type).toBe('treasure');
    const key = randomUUID();

    const makeReq = () =>
      new Request('http://localhost/api/v1/runs/current/treasure/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ version: 0 }),
      });

    const first = await postTreasureOpen(makeReq());
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { version: number };

    const second = await postTreasureOpen(makeReq());
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { version: number };

    expect(secondBody).toEqual(firstBody); // 再送は同一応答（副作用なし・versionも進まない）
  });
});
