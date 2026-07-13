// ショップ品揃えの生成（docs/20 §2.24 generateShopItems / docs/17 §9）。
//
// 【設計判断】
// 1. 関数シグネチャに `ownedRelics: readonly string[]` を追加した（実装指示のシグネチャには無いが、
//    レリック枠を「未所持から等重み抽選」にするには所持中レリックの除外が必須のため）。
// 2. 価格の基準価格の出典: docs/17 §9は装備をレア度別の一律価格（common60/rare120/epic240）としているが、
//    EquipmentMaster.basePrice は schema.prisma のコメントで既に「ショップ基準価格」と定義されており、
//    equipment.ts側で商品ごとに個別値（iron_sword=50等）が設定済みである。個別値の方が精緻かつ
//    schema定義と一致するため、装備は `equipment.basePrice` を基準価格として採用する（docs/17 §9の
//    一律表とは差異があるが、個別basePriceの方を正とする）。消耗品は src/constants/items.ts の
//    basePrice（docs/17 §9の値と完全一致: potion40/hi_potion90/antidote30）を使用する。
//    レリックはRelicMasterにbasePrice列が無いため、docs/17 §9の150Gを定数として保持する。
// 3. 価格の丸め: 実装指示コメントは `round` と書いているが、docs/17 §9本文は
//    `floor(基準価格 × (1 + 0.1 × 階層))` と明記しているためdocs優先でfloorを採用する
//    （CLAUDE.md: 「docs/ の設計書が唯一の正」）。
// 4. レリック枠が未所持切れ（全所持）の場合は docs/17 §9「全所持なら装備枠に振替」に従い、
//    装備枠をもう1枠追加する（rarityWeightsは装備2枠と同一ルール）。
import type { EquipmentMaster, RelicMaster } from '@/constants/masters/types';
import { CONSUMABLES } from '@/constants/items';
import type { ShopSlot } from '@/domain/dungeon/run-state';
import type { Rng } from '@/domain/shared/rng';

export interface ShopMasters {
  equipment: readonly EquipmentMaster[];
  relics: readonly RelicMaster[];
}

/** レリックのショップ基準価格（docs/17 §9 DEC-045。RelicMasterにbasePrice列が無いため定数） */
const RELIC_SHOP_BASE_PRICE = 150;

/** 装備枠のレア度重み（docs/17 §9: common50/rare40/epic10） */
const EQUIPMENT_RARITY_WEIGHTS = [
  { item: 'common' as const, weight: 50 },
  { item: 'rare' as const, weight: 40 },
  { item: 'epic' as const, weight: 10 },
];

function priceAt(basePrice: number, floor: number): number {
  return Math.floor(basePrice * (1 + 0.1 * floor));
}

function pickEquipmentSlot(
  floor: number,
  masters: ShopMasters,
  usedCodes: Set<string>,
  rng: Rng,
): ShopSlot | null {
  const rarity = rng.weighted(EQUIPMENT_RARITY_WEIGHTS);
  const candidates = masters.equipment.filter((e) => e.rarity === rarity && !usedCodes.has(e.code));
  if (candidates.length === 0) return null;
  const picked = rng.pick(candidates);
  usedCodes.add(picked.code);
  return {
    slotIndex: -1, // 呼び出し側でslotIndexを採番する
    kind: 'equipment',
    code: picked.code,
    price: priceAt(picked.basePrice, floor),
    soldOut: false,
  };
}

/**
 * generateShopItems（docs/20 §2.24）。
 * 5枠固定構成: 装備2 / 消耗品2 / レリック1（全所持時は装備1枠へ振替）。
 * ノード進入時に1回だけ呼び出し、結果はrun_state.pendingReward（type='shop'）に保存する
 * （再入場不可のため再抽選しない＝冪等性。docs/17 §9）。
 */
export function generateShopItems(
  floor: number,
  ownedRelics: readonly string[],
  masters: ShopMasters,
  rng: Rng,
): ShopSlot[] {
  const slots: ShopSlot[] = [];
  const usedEquipmentCodes = new Set<string>();

  for (let i = 0; i < 2; i += 1) {
    const slot = pickEquipmentSlot(floor, masters, usedEquipmentCodes, rng);
    if (slot) slots.push(slot);
  }

  const consumablePool = [...CONSUMABLES];
  for (let i = 0; i < 2 && consumablePool.length > 0; i += 1) {
    const idx = rng.int(0, consumablePool.length - 1);
    const [item] = consumablePool.splice(idx, 1);
    slots.push({
      slotIndex: -1,
      kind: 'consumable',
      code: item.code,
      price: priceAt(item.basePrice, floor),
      soldOut: false,
    });
  }

  const relicCandidates = masters.relics.filter((r) => !ownedRelics.includes(r.code));
  if (relicCandidates.length > 0) {
    const relic = rng.pick(relicCandidates);
    slots.push({
      slotIndex: -1,
      kind: 'relic',
      code: relic.code,
      price: priceAt(RELIC_SHOP_BASE_PRICE, floor),
      soldOut: false,
    });
  } else {
    const slot = pickEquipmentSlot(floor, masters, usedEquipmentCodes, rng);
    if (slot) slots.push(slot);
  }

  return slots.map((slot, index) => ({ ...slot, slotIndex: index }));
}
