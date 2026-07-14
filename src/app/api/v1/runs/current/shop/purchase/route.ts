import { NextResponse } from 'next/server';

import type { ConsumableCode } from '@/constants/items';
import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { EQUIPMENT } from '@/constants/masters/equipment';
import type { RunState } from '@/domain/dungeon/run-state';
import { ShopPurchaseError, purchaseShopItem, sellEquipmentPrice } from '@/domain/reward/purchase-shop-item';
import { shopActionSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

const RUN_EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'] as const;

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

function addConsumable(items: RunState['items'], code: ConsumableCode, count: number): RunState['items'] {
  const meta = CONSUMABLES_BY_CODE[code];
  const existing = items.find((i) => i.code === code);
  const currentCount = existing?.count ?? 0;
  const addable = Math.max(0, Math.min(count, meta.maxHold - currentCount));
  if (addable <= 0) return items;
  return existing
    ? items.map((i) => (i.code === code ? { ...i, count: i.count + addable } : i))
    : [...items, { code, count: addable }];
  // 所持上限超過分の換金（overflowGold）はショップ購入では発生しない想定（購入前提のためaddable<count時は稀）
}

/**
 * API-504 ショップ購入/売却/離脱（docs/13 §4.6）。
 * purchase/sellはpendingReward.slots・run_state（gold/items/relics/equipment）を更新するがphaseは
 * 'reward_pending'のまま維持する（繰り返し購入可能。実装指示）。leaveでmap_selectへ復帰する。
 */
export const POST = apiHandler('API-504', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, shopActionSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-504',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.pendingReward === null || state.pendingReward.type !== 'shop') {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在ショップにいません');
      }
      const pending = state.pendingReward;

      let nextState: RunState;
      let response: Record<string, unknown>;

      if (input.action === 'leave') {
        nextState = {
          ...state,
          pendingReward: null,
          position: { ...state.position, phase: 'map_select' },
        };
        response = { left: true, position: nextState.position };
      } else if (input.action === 'purchase') {
        let purchase;
        try {
          purchase = purchaseShopItem(pending.slots, input.slotIndex as number, state.gold);
        } catch (err) {
          if (err instanceof ShopPurchaseError) throw new AppError(err.reasonCode, err.message);
          throw err;
        }

        const gold = state.gold - purchase.cost;
        let items = state.items;
        let relics = state.relics;
        let equipment = state.equipment;
        let encountered = state.encountered;

        if (purchase.slot.kind === 'equipment') {
          const master = EQUIPMENT.find((e) => e.code === purchase.slot.code);
          if (master) {
            equipment = { ...equipment, [master.slot]: master.code };
            encountered = { ...encountered, equipment: addUnique(encountered.equipment, master.code) };
          }
        } else if (purchase.slot.kind === 'consumable') {
          items = addConsumable(items, purchase.slot.code as ConsumableCode, 1);
        } else {
          if (!relics.includes(purchase.slot.code)) {
            relics = [...relics, purchase.slot.code];
          }
          encountered = { ...encountered, relics: addUnique(encountered.relics, purchase.slot.code) };
        }

        nextState = {
          ...state,
          gold,
          items,
          relics,
          equipment,
          encountered,
          pendingReward: { ...pending, slots: purchase.slots },
        };
        response = { purchased: true, cost: purchase.cost, gold, slots: purchase.slots };
      } else {
        // sell: ラン内に「所持しているが未装備」の装備枠は存在しないため、現在装備中のいずれかを売却する
        const equipmentCode = input.equipmentCode as string;
        const slotKey = RUN_EQUIPMENT_SLOTS.find((key) => state.equipment[key] === equipmentCode);
        if (!slotKey) {
          throw new AppError('ERR_INVALID_ACTION', 'そのラン内装備は所持していません');
        }
        const master = EQUIPMENT.find((e) => e.code === equipmentCode);
        if (!master) {
          throw new AppError('ERR_INVALID_ACTION', '不明な装備です');
        }
        const displayPrice = Math.floor(master.basePrice * (1 + 0.1 * state.position.floor));
        const sellPrice = sellEquipmentPrice(displayPrice);
        const gold = state.gold + sellPrice;
        const equipment = { ...state.equipment, [slotKey]: null };

        nextState = {
          ...state,
          gold,
          equipment,
          pendingReward: { ...pending },
        };
        response = { sold: true, equipmentCode, price: sellPrice, gold };
      }

      return { nextState, response };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
