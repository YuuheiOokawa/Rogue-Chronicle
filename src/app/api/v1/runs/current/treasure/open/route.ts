import { NextResponse } from 'next/server';

import type { ConsumableCode } from '@/constants/items';
import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { EQUIPMENT } from '@/constants/masters/equipment';
import type { RunState } from '@/domain/dungeon/run-state';
import { treasureOpenSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/** 重複レリック受領時の代替ゴールド（API-508と同一の仮決定。docs/13 §4.6 API-508コメント） */
const DUPLICATE_RELIC_GOLD = 50;

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

function addConsumable(
  items: RunState['items'],
  gold: number,
  code: ConsumableCode,
  count: number,
): { items: RunState['items']; gold: number } {
  const meta = CONSUMABLES_BY_CODE[code];
  const existing = items.find((i) => i.code === code);
  const currentCount = existing?.count ?? 0;
  const addable = Math.max(0, Math.min(count, meta.maxHold - currentCount));
  const overflow = count - addable;
  let nextItems = items;
  if (addable > 0) {
    nextItems = existing
      ? items.map((i) => (i.code === code ? { ...i, count: i.count + addable } : i))
      : [...items, { code, count: addable }];
  }
  const nextGold = overflow > 0 ? gold + overflow * meta.overflowGold : gold;
  return { items: nextItems, gold: nextGold };
}

/**
 * API-503 宝箱開封（docs/13 §4.6）。
 * 入場時（select-node.ts）に抽選・保存済みの内容をそのまま適用する（開封時に再抽選しない）。
 * 実装指示（このタスクの指示）に基づき、装備/レリックの受領確認もAPI-507/508へ回さず
 * ここで直接反映する（docs/13原文はAPI-507/508経由としているが、実装指示に従いこの方式を採用。
 * docs/29 決定ログ参照）。
 */
export const POST = apiHandler('API-503', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, treasureOpenSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-503',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.pendingReward === null || state.pendingReward.type !== 'treasure') {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在開封できる宝箱がありません');
      }
      const reward = state.pendingReward;

      let gold = state.gold + (reward.goldAmount ?? 0);
      let items = state.items;
      let relics = state.relics;
      let equipment = state.equipment;
      let encountered = state.encountered;

      if (reward.rewardType === 'consumable' && reward.consumableCode) {
        const granted = addConsumable(items, gold, reward.consumableCode as ConsumableCode, 1);
        items = granted.items;
        gold = granted.gold;
      } else if (reward.rewardType === 'equipment' && reward.equipmentCode) {
        const master = EQUIPMENT.find((e) => e.code === reward.equipmentCode);
        if (master) {
          equipment = { ...equipment, [master.slot]: master.code };
          encountered = { ...encountered, equipment: addUnique(encountered.equipment, master.code) };
        }
      } else if (reward.rewardType === 'relic' && reward.relicCode) {
        if (relics.includes(reward.relicCode)) {
          gold += DUPLICATE_RELIC_GOLD;
        } else {
          relics = [...relics, reward.relicCode];
        }
        encountered = { ...encountered, relics: addUnique(encountered.relics, reward.relicCode) };
      }

      const nextState: RunState = {
        ...state,
        gold,
        items,
        relics,
        equipment,
        encountered,
        pendingReward: null,
        position: { ...state.position, phase: 'map_select' },
        // 宝箱経由のソウルシャード獲得（docs/05 §5.4「宝箱・イベント平均+5」。ISSUE-013解消）
        earned: { ...state.earned, soulShards: state.earned.soulShards + 5 },
      };
      return { nextState, response: { claimed: true, reward, position: nextState.position } };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
