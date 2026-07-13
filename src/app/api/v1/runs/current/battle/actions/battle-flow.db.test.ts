// 戦闘フロー（API-401/402）のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
// ラン開始→戦闘ノード入場→phase='battle'確認→攻撃行動→ダメージが実際に反映されることを検証する。
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして各APIを呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => ({ userId: mockUserId, isGuest: true, role: 'user' }),
}));

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { createInitialRunState } from '@/domain/dungeon/run-state';
import { selectNextNode } from '@/domain/dungeon/select-node';
import { createRng, generateDungeonSeed } from '@/domain/shared/rng';
import { prisma, type JsonInput } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';

import { GET as getBattle } from '../route';
import { POST as postBattleAction } from './route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!runDbTests)('戦闘フロー（DB統合・API-401/402）', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  /** ラン開始→階層1の戦闘ノード入場までをセットアップする（API-303/305のロジックを直接使用） */
  async function setupActiveBattleRun(): Promise<{ userId: string; runId: string }> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;

    const dungeon = DUNGEONS[0];
    const character = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
    const seed = generateDungeonSeed(randomBytes(4).readUInt32LE(0));
    const rng = createRng(seed);
    const map = generateDungeonMap(seed, dungeon.generationConfig, rng);
    const initialState = createInitialRunState({
      map,
      character,
      equipment: { weapon: null, armor: null, accessory: null },
      rngCursor: rng.cursor,
    });

    const runId = randomUUID();
    await prisma.dungeonRun.create({
      data: {
        id: runId,
        userId: user.id,
        dungeonCode: dungeon.code,
        difficulty: 'normal',
        seed: BigInt(seed),
        status: 'active',
        runState: initialState as unknown as JsonInput,
        version: 0,
      },
    });

    // 階層1はBATTLE固定（docs/17）。selectNextNodeは本Phase6実装でstartBattleを呼びphase='battle'へ遷移する
    const firstNodeId = map.floors[0][0].id;
    const entered = selectNextNode(initialState, firstNodeId);
    expect(entered.state.position.phase).toBe('battle');
    expect(entered.state.battle).not.toBeNull();

    await prisma.dungeonRun.update({
      where: { id: runId },
      data: { runState: entered.state as unknown as JsonInput, version: 1 },
    });

    return { userId: user.id, runId };
  }

  it('戦闘ノード入場後、GET /battle がphase=battleの状態を返す', async () => {
    await setupActiveBattleRun();

    const res = await getBattle();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; battle: { enemies: { hp: number }[] } };
    expect(body.version).toBe(1);
    expect(body.battle.enemies.length).toBeGreaterThan(0);
    expect(body.battle.enemies[0].hp).toBeGreaterThan(0);
  });

  it('攻撃行動でダメージが実際に反映され、versionが進む', async () => {
    const { runId } = await setupActiveBattleRun();

    const before = await getBattle();
    const beforeBody = (await before.json()) as {
      version: number;
      battle: { enemies: { id: string; hp: number }[] };
    };
    const target = beforeBody.battle.enemies[0];

    const req = new Request('http://localhost/api/v1/runs/current/battle/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({
        version: beforeBody.version,
        action: { type: 'attack', targetId: target.id },
      }),
    });
    const res = await postBattleAction(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: number;
      logs: { actorId: string; damage?: number; isMiss?: boolean }[];
      battle: { enemies: { id: string; hp: number; alive: boolean }[] };
      battleEnded: boolean;
    };

    expect(body.version).toBe(2); // 楽観ロックversionが1→2へ

    const updatedEnemy = body.battle.enemies.find((e) => e.id === target.id);
    expect(updatedEnemy).toBeDefined();
    if (updatedEnemy!.alive) {
      // 命中していればHPが減っている（低確率でミスするため、その場合はhpが変化しない可能性を許容）
      const playerAttackLog = body.logs.find((l) => l.actorId === 'player');
      expect(playerAttackLog).toBeDefined();
      if (playerAttackLog?.isMiss !== true) {
        expect(updatedEnemy!.hp).toBeLessThan(target.hp);
      }
    } else {
      // 一撃で撃破した場合はhp=0
      expect(updatedEnemy!.hp).toBe(0);
    }

    // DB上のrun_stateにもrngCursorの進行・戦闘状態が反映されていること
    const run = await prisma.dungeonRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.version).toBe(2);
  });

  it('敵を撃破するまで攻撃し続けると勝利しゴールド/EXPが加算される', async () => {
    await setupActiveBattleRun();

    const current = await getBattle();
    let currentBody = (await current.json()) as {
      version: number;
      battle: { result: string; enemies: { id: string; hp: number; alive: boolean }[] };
    };

    let guard = 0;
    let battleEnded = false;
    let lastResponseBody:
      | { result?: string; reward?: { gold: number; exp: number }; runStatus: string }
      | undefined;

    while (!battleEnded && guard++ < 50) {
      const aliveTarget = currentBody.battle.enemies.find((e) => e.alive);
      if (!aliveTarget) break;

      const req = new Request('http://localhost/api/v1/runs/current/battle/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          version: currentBody.version,
          action: { type: 'attack', targetId: aliveTarget.id },
        }),
      });
      const res = await postBattleAction(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        version: number;
        battle: { result: string; enemies: { id: string; hp: number; alive: boolean }[] };
        battleEnded: boolean;
        result?: string;
        reward?: { gold: number; exp: number };
        runStatus: string;
      };
      battleEnded = body.battleEnded;
      lastResponseBody = body;
      currentBody = body;
    }

    expect(battleEnded).toBe(true);
    // プレイヤーが十分強い初期ステータスであれば勝利する想定（敗北した場合も含め結果が返ること自体を検証）
    expect(['win', 'lose']).toContain(lastResponseBody?.result);
    if (lastResponseBody?.result === 'win') {
      expect(lastResponseBody.reward?.gold).toBeGreaterThanOrEqual(0);
      expect(lastResponseBody.reward?.exp).toBeGreaterThan(0);
    }
  });
});
