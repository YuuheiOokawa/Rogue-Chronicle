// API-306（リタイア）→API-307（finalize）のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
// リタイア→retired遷移→finalize→player_currencies/player_progress/currency_transactions反映→
// 二重finalizeが安全に拒否される（ソウルシャードが二重付与されない）ことを検証する。
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして各APIを呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => ({ userId: mockUserId, isGuest: true, role: 'user' }),
}));

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { completeDungeon, failDungeon } from '@/domain/dungeon/finalize-status';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { createInitialRunState, type RunState } from '@/domain/dungeon/run-state';
import { ZERO_UPGRADE_BONUS } from '@/domain/progression/apply-upgrades';
import { createRng, generateDungeonSeed } from '@/domain/shared/rng';
import { prisma, type JsonInput } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';
import { finalizeRun } from '@/server/usecases/run/finalize-run';

import { POST as postFinalize } from './finalize/route';
import { POST as postRetire } from './retire/route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

function buildInitialState(): RunState {
  const dungeon = DUNGEONS[0];
  const character = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
  const seed = generateDungeonSeed(randomBytes(4).readUInt32LE(0));
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, dungeon.generationConfig, rng);
  return createInitialRunState({
    map,
    character,
    equipment: { weapon: null, armor: null, accessory: null },
    rngCursor: rng.cursor,
    upgradeBonus: ZERO_UPGRADE_BONUS,
    startRelic: null,
  });
}

describe.skipIf(!runDbTests)('リタイア→finalize フロー（DB統合・API-306/307）', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function createTestUser(): Promise<string> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;
    return user.id;
  }

  /** ラン開始し、少し進行させた状態（floor=3, kills=5相当のearned）でactiveランを作成する */
  async function setupActiveRun(userId: string): Promise<{ runId: string }> {
    let state = buildInitialState();
    state = {
      ...state,
      position: { ...state.position, floor: 3, nodeId: 'f3n0' },
      earned: { ...state.earned, soulShards: 140, rankExp: 0, kills: 5, eliteKills: 1 },
    };
    // 到達済みノードとしてf3n0が存在しなくても validateRunState は position.nodeId のみ検証するため、
    // 実マップ上のノードIDを使う（floor3の先頭ノード）
    const floor3NodeId = state.map.floors[2][0].id;
    state = { ...state, position: { ...state.position, nodeId: floor3NodeId } };

    const runId = randomUUID();
    await prisma.dungeonRun.create({
      data: {
        id: runId,
        userId,
        dungeonCode: 'forgotten_ruins',
        difficulty: 'normal',
        seed: BigInt(1),
        status: 'active',
        runState: state as unknown as JsonInput,
        version: 0,
      },
    });
    return { runId };
  }

  function jsonRequest(url: string, body: unknown, idempotencyKey: string): Request {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
  }

  it('リタイア→finalize: retiredへ遷移し、ソウルシャード80%がplayer_currencies/player_progress/currency_transactionsへ反映される', async () => {
    const userId = await createTestUser();
    const { runId } = await setupActiveRun(userId);

    // API-306 リタイア
    const retireRes = await postRetire(
      jsonRequest('http://localhost/api/v1/runs/current/retire', { version: 0 }, randomUUID()),
    );
    expect(retireRes.status).toBe(200);
    const retireBody = (await retireRes.json()) as {
      retired: true;
      reachedFloor: number;
      earned: { soulShards: number; rankExp: number };
      version: number;
    };
    expect(retireBody.retired).toBe(true);
    // DEC-025: 常に80%（100の80% = 80。端数はfloor）
    expect(retireBody.earned.soulShards).toBe(Math.floor(140 * 0.8));
    expect(retireBody.version).toBe(1);

    const afterRetire = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    expect(afterRetire.status).toBe('retired');

    // API-307 finalize
    const finalizeKey = randomUUID();
    const finalizeRes = await postFinalize(
      jsonRequest('http://localhost/api/v1/runs/current/finalize', { version: 1 }, finalizeKey),
    );
    expect(finalizeRes.status).toBe(200);
    const finalizeBody = (await finalizeRes.json()) as {
      finalStatus: string;
      runStatus: string;
      soulShards: { granted: number; balance: number };
      version: number;
    };
    expect(finalizeBody.finalStatus).toBe('retired');
    expect(finalizeBody.runStatus).toBe('finalized');
    expect(finalizeBody.soulShards.granted).toBe(Math.floor(140 * 0.8));
    expect(finalizeBody.soulShards.balance).toBe(Math.floor(140 * 0.8));

    const runAfterFinalize = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    expect(runAfterFinalize.status).toBe('finalized');

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(Math.floor(140 * 0.8));

    const progress = await prisma.playerProgress.findUniqueOrThrow({ where: { userId } });
    expect(progress.totalRuns).toBe(1);
    expect(progress.totalClears).toBe(0);
    expect(progress.totalDefeats).toBe(0);
    expect(progress.totalKills).toBe(5);
    expect(progress.eliteKills).toBe(1);

    const tx = await prisma.currencyTransaction.findUniqueOrThrow({
      where: { idempotencyKey: finalizeKey },
    });
    expect(tx).toMatchObject({
      userId,
      currency: 'soul_shards',
      amount: Math.floor(140 * 0.8),
      balanceAfter: Math.floor(140 * 0.8),
      reason: 'run_finalize',
      refId: runId,
    });

    // ach_first_run（累計ラン1回で解除）が今回のfinalizeで解除されているはず
    expect(finalizeBody).toHaveProperty('finalStatus');
    const achievement = await prisma.playerAchievement.findUnique({
      where: { userId_achievementCode: { userId, achievementCode: 'ach_first_run' } },
    });
    expect(achievement).not.toBeNull();
  });

  it('finalize二重実行（同一キー再送）: 保存済み応答を再生し、ソウルシャードは二重付与されない', async () => {
    const userId = await createTestUser();
    await setupActiveRun(userId);

    await postRetire(
      jsonRequest('http://localhost/api/v1/runs/current/retire', { version: 0 }, randomUUID()),
    );
    const finalizeKey = randomUUID();
    const first = await postFinalize(
      jsonRequest('http://localhost/api/v1/runs/current/finalize', { version: 1 }, finalizeKey),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { soulShards: { granted: number; balance: number } };

    // 同一Idempotency-Key・同一bodyでの再送 = 保存済み応答の再生（処理は再実行されない）
    const replay = await postFinalize(
      jsonRequest('http://localhost/api/v1/runs/current/finalize', { version: 1 }, finalizeKey),
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { soulShards: { granted: number; balance: number } };
    expect(replayBody.soulShards.granted).toBe(firstBody.soulShards.granted);

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(firstBody.soulShards.balance); // 二重加算されていない

    const txCount = await prisma.currencyTransaction.count({ where: { userId, reason: 'run_finalize' } });
    expect(txCount).toBe(1);
  });

  it('finalize二重実行（別キー）: 2回目はERR_REWARD_ALREADY_CLAIMED(409)となり報酬は増えない', async () => {
    const userId = await createTestUser();
    await setupActiveRun(userId);

    await postRetire(
      jsonRequest('http://localhost/api/v1/runs/current/retire', { version: 0 }, randomUUID()),
    );
    const first = await postFinalize(
      jsonRequest('http://localhost/api/v1/runs/current/finalize', { version: 1 }, randomUUID()),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { soulShards: { granted: number; balance: number } };

    // 別のIdempotency-Keyで再実行（バグ・多重タブ等を想定） → 既にfinalized済みのため拒否
    const second = await postFinalize(
      jsonRequest('http://localhost/api/v1/runs/current/finalize', { version: 2 }, randomUUID()),
    );
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { errorCode: string };
    expect(secondBody.errorCode).toBe('ERR_REWARD_ALREADY_CLAIMED');

    const currency = await prisma.playerCurrency.findUniqueOrThrow({ where: { userId } });
    expect(currency.soulShards).toBe(firstBody.soulShards.balance); // 増えていない

    const txCount = await prisma.currencyTransaction.count({ where: { userId, reason: 'run_finalize' } });
    expect(txCount).toBe(1);
  });

  it('クリアfinalize: ソウルシャード100%+クリアボーナス、totalClearsが加算される', async () => {
    const userId = await createTestUser();
    let state = buildInitialState();
    const lastFloor = state.map.floors.length;
    state = {
      ...state,
      position: { ...state.position, floor: lastFloor },
      earned: { ...state.earned, soulShards: 200, rankExp: 0, kills: 20, eliteKills: 2 },
    };
    state = completeDungeon(state);

    const runId = randomUUID();
    await prisma.dungeonRun.create({
      data: {
        id: runId,
        userId,
        dungeonCode: 'forgotten_ruins',
        difficulty: 'normal',
        seed: BigInt(1),
        status: 'cleared',
        runState: state as unknown as JsonInput,
        version: 0,
      },
    });

    const result = await finalizeRun({ userId, idempotencyKey: randomUUID(), expectedVersion: 0 });
    expect(result.response.finalStatus).toBe('cleared');
    expect(result.response.soulShards.granted).toBe(Math.floor(200 * 1.0) + 50); // completeDungeonの係数

    const progress = await prisma.playerProgress.findUniqueOrThrow({ where: { userId } });
    expect(progress.totalClears).toBe(1);
    expect(progress.totalDefeats).toBe(0);

    const achievement = await prisma.playerAchievement.findUnique({
      where: { userId_achievementCode: { userId, achievementCode: 'ach_first_clear' } },
    });
    expect(achievement).not.toBeNull();
  });

  it('敗北finalize: ソウルシャード50%、totalDefeatsが加算される', async () => {
    const userId = await createTestUser();
    let state = buildInitialState();
    state = {
      ...state,
      character: { ...state.character, hp: 0 },
      position: { ...state.position, floor: 2 },
      earned: { ...state.earned, soulShards: 60, rankExp: 0, kills: 3, eliteKills: 0 },
    };
    state = failDungeon(state);

    const runId = randomUUID();
    await prisma.dungeonRun.create({
      data: {
        id: runId,
        userId,
        dungeonCode: 'forgotten_ruins',
        difficulty: 'normal',
        seed: BigInt(1),
        status: 'failed',
        runState: state as unknown as JsonInput,
        version: 0,
      },
    });

    const result = await finalizeRun({ userId, idempotencyKey: randomUUID(), expectedVersion: 0 });
    expect(result.response.finalStatus).toBe('failed');
    expect(result.response.soulShards.granted).toBe(Math.floor(60 * 0.5));

    const progress = await prisma.playerProgress.findUniqueOrThrow({ where: { userId } });
    expect(progress.totalDefeats).toBe(1);
    expect(progress.totalClears).toBe(0);
  });
});
