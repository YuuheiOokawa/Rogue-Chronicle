// ショップ購入の検証・計算（docs/20 §2.25 purchaseShopItem / docs/17 §9）。
// 実際のgold減算・アイテム/装備/レリック付与はAPI層（server/usecases）の責務とする
// （純粋関数は「検証+コスト算出+slots更新」のみを返す。docs/20 §2.25手順4の「gold減算・付与」も
//   本来はここに含まれるが、run_state全体の更新は呼び出し側でまとめて行う設計とする）。
import type { ShopSlot } from '@/domain/dungeon/run-state';

export type ShopPurchaseErrorCode = 'ERR_RUN_STATE_INVALID' | 'ERR_INSUFFICIENT_GOLD' | 'ERR_REWARD_ALREADY_CLAIMED';

export class ShopPurchaseError extends Error {
  constructor(
    public readonly reasonCode: ShopPurchaseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ShopPurchaseError';
  }
}

export interface PurchaseShopItemResult {
  slots: ShopSlot[];
  cost: number;
  slot: ShopSlot;
}

/**
 * purchaseShopItem（docs/20 §2.25）。
 * 1) slotIndexの存在検証 2) soldOut検証 3) 所持金検証 4) soldOut=trueにしたslots配列を返す。
 */
export function purchaseShopItem(
  slots: readonly ShopSlot[],
  slotIndex: number,
  currentGold: number,
): PurchaseShopItemResult {
  const slot = slots.find((s) => s.slotIndex === slotIndex);
  if (!slot) {
    throw new ShopPurchaseError('ERR_RUN_STATE_INVALID', `slot ${slotIndex} not found`);
  }
  if (slot.soldOut) {
    throw new ShopPurchaseError('ERR_REWARD_ALREADY_CLAIMED', `slot ${slotIndex} already sold out`);
  }
  if (currentGold < slot.price) {
    throw new ShopPurchaseError('ERR_INSUFFICIENT_GOLD', `gold ${currentGold} < price ${slot.price}`);
  }
  const nextSlot: ShopSlot = { ...slot, soldOut: true };
  const nextSlots = slots.map((s) => (s.slotIndex === slotIndex ? nextSlot : s));
  return { slots: nextSlots, cost: slot.price, slot: nextSlot };
}

/**
 * sellEquipmentPrice（docs/17 §9）: 売却額 = floor(購入相当価格 × 0.5)。
 * basePriceには「現在階層での表示価格」（floor(基準価格×(1+0.1×階層))）を渡すこと（呼び出し側の責務）。
 */
export function sellEquipmentPrice(basePrice: number): number {
  return Math.floor(basePrice * 0.5);
}
