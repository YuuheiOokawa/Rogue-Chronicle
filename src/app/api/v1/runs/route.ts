import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { EQUIPMENT } from '@/constants/masters/equipment';
import type { EquipmentMaster } from '@/constants/masters/types';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { createInitialRunState } from '@/domain/dungeon/run-state';
import { createRng, generateDungeonSeed } from '@/domain/shared/rng';
import { startRunSchema } from '@/schemas/run';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { logger } from '@/server/services/logger';
import { prisma, type JsonInput } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import { toRunView } from '@/server/usecases/run/run-view';

export const dynamic = 'force-dynamic';

/**
 * API-303 ダンジョン開始（docs/13 §4.4・重要）。
 * 検証: キャラ解放済み / 装備所持 / アクティブラン不存在（最終防衛線=部分UNIQUEインデックス）。
 * seed生成→マップ生成→run_state初期化→INSERT+スナップショット世代0 を1トランザクションで実行。
 */
export const POST = apiHandler('API-303', async (traceId, req: Request) => {
  const session = await requireUser();
  const input = await parseBody(req, startRunSchema);

  // マスタ検証
  const dungeon = DUNGEONS.find((d) => d.code === input.dungeonCode);
  if (!dungeon) throw new AppError('ERR_NOT_FOUND', 'ダンジョンが見つかりません');
  const difficulty = dungeon.difficulties.find((d) => d.code === input.difficulty);
  if (!difficulty || difficulty.unlockCondition !== null) {
    throw new AppError('ERR_INVALID_ACTION', 'この難易度は選択できません');
  }
  const character = CHARACTERS.find((c) => c.code === input.characterCode);
  if (!character) throw new AppError('ERR_NOT_FOUND', 'キャラクターが見つかりません');

  // 所持検証（キャラ解放・装備解放）
  const [ownedCharacter, ownedEquipment] = await Promise.all([
    prisma.playerCharacter.findUnique({
      where: {
        userId_characterCode: { userId: session.userId, characterCode: input.characterCode },
      },
    }),
    prisma.playerEquipment.findMany({ where: { userId: session.userId } }),
  ]);
  if (!ownedCharacter) {
    throw new AppError('ERR_INVALID_ACTION', 'このキャラクターは解放されていません');
  }
  const ownedCodes = new Set(ownedEquipment.map((e) => e.equipmentCode));
  const resolveEquip = (
    code: string | null,
    slot: 'weapon' | 'armor' | 'accessory',
  ): EquipmentMaster | null => {
    if (code === null) return null;
    if (!ownedCodes.has(code)) {
      throw new AppError('ERR_INVALID_ACTION', '所持していない装備が指定されました');
    }
    const master = EQUIPMENT.find((e) => e.code === code);
    if (!master || master.slot !== slot) {
      throw new AppError('ERR_INVALID_ACTION', '装備スロットが一致しません');
    }
    return master;
  };
  const equipment = {
    weapon: resolveEquip(input.equipment.weapon, 'weapon'),
    armor: resolveEquip(input.equipment.armor, 'armor'),
    accessory: resolveEquip(input.equipment.accessory, 'accessory'),
  };

  // アクティブラン検査（UX用の事前チェック。最終防衛線はDBの部分UNIQUE）
  const active = await prisma.dungeonRun.findFirst({
    where: { userId: session.userId, status: 'active' },
    select: { id: true },
  });
  if (active) throw new AppError('ERR_RUN_ALREADY_ACTIVE');

  // seed生成（乱数源はdomain外から注入。DEC-019）
  const seed = generateDungeonSeed(randomBytes(4).readUInt32LE(0));
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, dungeon.generationConfig, rng);
  const runState = createInitialRunState({
    map,
    character,
    equipment,
    rngCursor: rng.cursor,
  });

  const runId = uuidv7();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.dungeonRun.create({
        data: {
          id: runId,
          userId: session.userId,
          dungeonCode: dungeon.code,
          difficulty: difficulty.code,
          seed: BigInt(seed),
          status: 'active',
          runState: runState as unknown as JsonInput,
          version: 0,
        },
      });
      await tx.dungeonRunSnapshot.create({
        data: { runId, generation: 0, runState: runState as unknown as JsonInput },
      });
    });
  } catch (err) {
    // 部分UNIQUEインデックス違反 = 同時開始の競合
    if ((err as { code?: string }).code === 'P2002') {
      throw new AppError('ERR_RUN_ALREADY_ACTIVE');
    }
    throw err;
  }

  logger.info('run_started', { traceId, userId: session.userId, runId });
  return NextResponse.json(
    toRunView(
      { id: runId, dungeonCode: dungeon.code, difficulty: difficulty.code, status: 'active', version: 0 },
      runState,
    ),
    { status: 201 },
  );
});
