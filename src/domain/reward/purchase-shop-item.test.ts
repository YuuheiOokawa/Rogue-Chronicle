import { describe, expect, it } from 'vitest';

import type { ShopSlot } from '@/domain/dungeon/run-state';

import { purchaseShopItem, sellEquipmentPrice, ShopPurchaseError } from './purchase-shop-item';

const slots: ShopSlot[] = [
  { slotIndex: 0, kind: 'equipment', code: 'iron_sword', price: 84, soldOut: false },
  { slotIndex: 1, kind: 'consumable', code: 'potion', price: 56, soldOut: true },
];

describe('purchaseShopItem', () => {
  it('所持金が足りれば購入成功し、該当slotがsoldOut=trueになる', () => {
    const result = purchaseShopItem(slots, 0, 100);
    expect(result.cost).toBe(84);
    expect(result.slot.soldOut).toBe(true);
    expect(result.slots.find((s) => s.slotIndex === 0)?.soldOut).toBe(true);
    // 元の配列は変更しない（イミュータブル）
    expect(slots[0].soldOut).toBe(false);
  });

  it('所持金不足はERR_INSUFFICIENT_GOLDで拒否', () => {
    expect(() => purchaseShopItem(slots, 0, 10)).toThrow(ShopPurchaseError);
    try {
      purchaseShopItem(slots, 0, 10);
    } catch (e) {
      expect((e as ShopPurchaseError).reasonCode).toBe('ERR_INSUFFICIENT_GOLD');
    }
  });

  it('売り切れ枠の再購入はERR_REWARD_ALREADY_CLAIMEDで拒否', () => {
    expect(() => purchaseShopItem(slots, 1, 1000)).toThrow(ShopPurchaseError);
    try {
      purchaseShopItem(slots, 1, 1000);
    } catch (e) {
      expect((e as ShopPurchaseError).reasonCode).toBe('ERR_REWARD_ALREADY_CLAIMED');
    }
  });

  it('存在しないslotIndexはERR_RUN_STATE_INVALIDで拒否', () => {
    try {
      purchaseShopItem(slots, 99, 1000);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ShopPurchaseError).reasonCode).toBe('ERR_RUN_STATE_INVALID');
    }
  });
});

describe('sellEquipmentPrice', () => {
  it('購入価格の50%（floor）', () => {
    expect(sellEquipmentPrice(101)).toBe(50);
    expect(sellEquipmentPrice(100)).toBe(50);
    expect(sellEquipmentPrice(1)).toBe(0);
  });
});
