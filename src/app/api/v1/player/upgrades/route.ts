import { NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

import { UPGRADE_NODES } from '@/constants/masters/upgrades';
import type { UpgradeNodeMaster } from '@/constants/masters/types';
import { computeUpgradeBonus, validateUpgradePurchase } from '@/domain/progression/apply-upgrades';
import { upgradeSchema } from '@/schemas/upgrade';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';

export const dynamic = 'force-dynamic';

/**
 * API-204 永続強化（docs/13 §4.3 / docs/09 SCR-106）。
 *
 * 【DEC-287】docs/09 SCR-106は表示データ取得をAPI-102拡張（仮決定）としているが、本実装では
 * API-204と同一リソースのGETとして独立実装する（REST的な一貫性のため。docs/29 DEC-287参照）。
 */

export interface UpgradeNodeView {
  code: string;
  name: string;
  description: string;
  effect: UpgradeNodeMaster['effect'];
  maxRank: number;
  costPerRank: number[];
  prerequisiteCode: string | null;
  /** 現在の所持rank（player_upgrades行が無ければ0） */
  rank: number;
  /** 前提条件を満たし、かつ rank < maxRank（次段を購入できる状態） */
  unlockable: boolean;
}

export interface UpgradesResponse {
  items: UpgradeNodeView[];
  /** 表示用の合計ボーナス（CORE_SPEC §5.9の上限+30%込み） */
  totalBonusPct: { hp: number; atk: number; capPct: number };
  soulShards: number;
}

export interface UpgradePurchaseResponse {
  upgradeNodeCode: string;
  rank: number;
  maxRank: number;
  currencies: { soulShards: number };
}

/** GET /api/v1/player/upgrades（API-204と同一リソースのGET。DEC-287） */
export const GET = apiHandler('API-204', async () => {
  const session = await requireUser();

  const [playerUpgrades, currency] = await Promise.all([
    prisma.playerUpgrade.findMany({ where: { userId: session.userId } }),
    prisma.playerCurrency.findUnique({ where: { userId: session.userId } }),
  ]);
  const ranks = new Map(playerUpgrades.map((u) => [u.upgradeNodeCode, u.rank]));

  const items: UpgradeNodeView[] = UPGRADE_NODES.slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((node) => {
      const rank = ranks.get(node.code) ?? 0;
      const prerequisiteRank =
        node.prerequisiteCode !== null ? (ranks.get(node.prerequisiteCode) ?? 0) : 0;
      const prerequisiteMet = node.prerequisiteCode === null || prerequisiteRank >= 1;
      return {
        code: node.code,
        name: node.name,
        description: node.description,
        effect: node.effect,
        maxRank: node.maxRank,
        costPerRank: node.costPerRank,
        prerequisiteCode: node.prerequisiteCode,
        rank,
        unlockable: prerequisiteMet && rank < node.maxRank,
      };
    });

  const bonus = computeUpgradeBonus(ranks, UPGRADE_NODES);

  const body: UpgradesResponse = {
    items,
    totalBonusPct: { hp: bonus.startHpPct, atk: bonus.startAtkPct, capPct: 30 },
    soulShards: currency?.soulShards ?? 0,
  };
  return NextResponse.json(body);
});

/**
 * POST /api/v1/player/upgrades（API-204本体）。
 * 冪等性はIdempotency-Keyではなく段数遷移（targetRank）+通貨条件付きUPDATEで担保する
 * （docs/13 API-204注記。ラン系APIではないため withActiveRunMutation 等は使わない）。
 */
export const POST = apiHandler('API-204', async (_traceId, req: Request) => {
  const session = await requireUser();
  const input = await parseBody(req, upgradeSchema);

  const node = UPGRADE_NODES.find((n) => n.code === input.upgradeNodeCode);

  const [current, prerequisite] = await Promise.all([
    node
      ? prisma.playerUpgrade.findUnique({
          where: {
            userId_upgradeNodeCode: { userId: session.userId, upgradeNodeCode: node.code },
          },
        })
      : null,
    node?.prerequisiteCode
      ? prisma.playerUpgrade.findUnique({
          where: {
            userId_upgradeNodeCode: { userId: session.userId, upgradeNodeCode: node.prerequisiteCode },
          },
        })
      : null,
  ]);

  let cost: number;
  try {
    ({ cost } = validateUpgradePurchase({
      node,
      currentRank: current?.rank ?? 0,
      targetRank: input.targetRank,
      prerequisiteRank: prerequisite?.rank ?? 0,
    }));
  } catch (err) {
    if (err instanceof RangeError) {
      switch (err.message) {
        case 'unknown upgrade node':
          throw new AppError('ERR_NOT_FOUND', '強化ノードが見つかりません');
        case 'already purchased':
          throw new AppError('ERR_REWARD_ALREADY_CLAIMED', 'この強化は購入済みです');
        case 'prerequisite not met':
          throw new AppError('ERR_INVALID_ACTION', '前提となる強化が未達成です');
        default:
          throw new AppError('ERR_INVALID_ACTION', 'この強化は現在購入できません');
      }
    }
    throw err;
  }
  // node は validateUpgradePurchase を通過した時点で必ず存在する
  const targetNode = node!;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.playerCurrency.updateMany({
      where: { userId: session.userId, soulShards: { gte: cost } },
      data: { soulShards: { decrement: cost }, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      const balance = await tx.playerCurrency.findUnique({ where: { userId: session.userId } });
      throw new AppError('ERR_INSUFFICIENT_SHARDS', undefined, {
        required: cost,
        current: balance?.soulShards ?? 0,
      });
    }

    const balance = await tx.playerCurrency.findUniqueOrThrow({ where: { userId: session.userId } });

    await tx.playerUpgrade.upsert({
      where: {
        userId_upgradeNodeCode: { userId: session.userId, upgradeNodeCode: targetNode.code },
      },
      create: { userId: session.userId, upgradeNodeCode: targetNode.code, rank: input.targetRank },
      update: { rank: input.targetRank },
    });

    await tx.currencyTransaction.create({
      data: {
        id: uuidv7(),
        userId: session.userId,
        currency: 'soul_shards',
        amount: -cost,
        balanceAfter: balance.soulShards,
        reason: 'upgrade',
        refId: targetNode.code,
      },
    });

    return { soulShards: balance.soulShards };
  });

  const body: UpgradePurchaseResponse = {
    upgradeNodeCode: targetNode.code,
    rank: input.targetRank,
    maxRank: targetNode.maxRank,
    currencies: { soulShards: result.soulShards },
  };
  return NextResponse.json(body);
});
