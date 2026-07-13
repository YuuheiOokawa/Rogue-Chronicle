import { describe, expect, it } from 'vitest';

import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { CONSUMABLES } from '@/constants/items';
import { createRng } from '@/domain/shared/rng';

import { generateShopItems } from './generate-shop';

const masters = { equipment: EQUIPMENT, relics: RELICS };

describe('generateShopItems', () => {
  it('枠構成: 5枠（装備2/消耗品2/レリック1）で、slotIndexが0..4で連番', () => {
    const slots = generateShopItems(4, [], masters, createRng(1));
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(slots.filter((s) => s.kind === 'equipment')).toHaveLength(2);
    expect(slots.filter((s) => s.kind === 'consumable')).toHaveLength(2);
    expect(slots.filter((s) => s.kind === 'relic')).toHaveLength(1);
  });

  it('全レリック所持時は装備枠へ振替され、装備3/消耗品2の5枠になる', () => {
    const ownedAll = RELICS.map((r) => r.code);
    const slots = generateShopItems(4, ownedAll, masters, createRng(3));
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.kind === 'equipment')).toHaveLength(3);
    expect(slots.filter((s) => s.kind === 'relic')).toHaveLength(0);
  });

  it('価格式: floor(基準価格 × (1 + 0.1 × 階層))。装備はequipment.basePrice、消耗品はCONSUMABLES.basePriceを基準とする', () => {
    const floor = 4;
    const slots = generateShopItems(floor, [], masters, createRng(9));
    for (const slot of slots) {
      if (slot.kind === 'equipment') {
        const master = EQUIPMENT.find((e) => e.code === slot.code)!;
        expect(slot.price).toBe(Math.floor(master.basePrice * (1 + 0.1 * floor)));
      }
      if (slot.kind === 'consumable') {
        const item = CONSUMABLES.find((c) => c.code === slot.code)!;
        expect(slot.price).toBe(Math.floor(item.basePrice * (1 + 0.1 * floor)));
      }
      if (slot.kind === 'relic') {
        expect(slot.price).toBe(Math.floor(150 * (1 + 0.1 * floor)));
      }
    }
  });

  it('装備2枠は重複しない、消耗品2枠も重複しない', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const slots = generateShopItems(5, [], masters, createRng(seed));
      const equipCodes = slots.filter((s) => s.kind === 'equipment').map((s) => s.code);
      const consumableCodes = slots.filter((s) => s.kind === 'consumable').map((s) => s.code);
      expect(new Set(equipCodes).size).toBe(equipCodes.length);
      expect(new Set(consumableCodes).size).toBe(consumableCodes.length);
    }
  });

  it('全て soldOut=false で生成される', () => {
    const slots = generateShopItems(1, [], masters, createRng(1));
    expect(slots.every((s) => !s.soldOut)).toBe(true);
  });
});
