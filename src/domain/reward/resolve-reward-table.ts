// reward_tables（src/constants/masters/reward-tables.ts）の共通抽選ヘルパ（Phase7で新規追加）。
// calculateBattleReward（敵ドロップ）/ generateTreasureReward（宝箱）/
// executeRandomEvent の treasureRoll 効果（イベント内宝箱抽選）から共用する。
//
// reward_tables.entries の抽選規則（reward-tables.tsコメント準拠）:
// - guaranteed!=true かつ weight>0 の行 = 「重み抽選プール」。ここから常に1件を rng.weighted で選ぶ
//   （プールが空のテーブル＝rt_bossのような全行guaranteedのテーブルではスキップ）
// - guaranteed=true の行 = 重み抽選とは独立に必ず候補となる。chancePctがあればその確率で追加抽選、
//   なければ常に適用（rt_treasure_secretの固定60G、rt_bossの確定レリック等）
// 呼び出し側は返された ResolvedRewardItem[] を用途に応じて解釈する
// （例: gold型はBattleRewardではgoldへ合算、宝箱ではgoldAmountとして保存）。
import type { EquipmentMaster, RelicMaster, RewardEntry, RewardTableMaster } from '@/constants/masters/types';
import type { Rng } from '@/domain/shared/rng';

export interface ResolvedRewardItem {
  rewardType: 'equipment' | 'gold' | 'consumable' | 'relic';
  /** equipment/consumable/relicのcode */
  code?: string;
  /** goldのみ */
  amount?: number;
}

export interface RewardMasters {
  equipment: readonly EquipmentMaster[];
  relics: readonly RelicMaster[];
}

/** 装備: params.rarityWeightsでレア度を抽選し、該当レア度内から等重み抽選（全スロット対象） */
function resolveEquipment(entry: RewardEntry, masters: RewardMasters, rng: Rng): ResolvedRewardItem {
  const rarityWeights = (entry.params as { rarityWeights?: Record<string, number> }).rarityWeights ?? {};
  const rarityPool = Object.entries(rarityWeights).filter(([, w]) => w > 0);
  if (rarityPool.length === 0) throw new RangeError('resolveEquipment: rarityWeights is empty');
  const rarity = rng.weighted(rarityPool.map(([r, w]) => ({ item: r, weight: w })));
  const candidates = masters.equipment.filter((e) => e.rarity === rarity);
  if (candidates.length === 0) throw new RangeError(`resolveEquipment: no equipment for rarity=${rarity}`);
  return { rewardType: 'equipment', code: rng.pick(candidates).code };
}

/** 消耗品: params.itemWeightsから等重みではなく重み付き抽選 */
function resolveConsumable(entry: RewardEntry): { pick: (rng: Rng) => ResolvedRewardItem } {
  const itemWeights = (entry.params as { itemWeights?: Record<string, number> }).itemWeights ?? {};
  const pool = Object.entries(itemWeights).filter(([, w]) => w > 0);
  return {
    pick: (rng: Rng) => {
      if (pool.length === 0) throw new RangeError('resolveConsumable: itemWeights is empty');
      const code = rng.weighted(pool.map(([c, w]) => ({ item: c, weight: w })));
      return { rewardType: 'consumable', code };
    },
  };
}

/** ゴールド: params.amount固定 or floor((base+perFloor×floor)×rand(randMin,randMax)) */
function resolveGold(entry: RewardEntry, floor: number, rng: Rng): ResolvedRewardItem {
  const params = entry.params as {
    amount?: number;
    base?: number;
    perFloor?: number;
    randMin?: number;
    randMax?: number;
  };
  if (params.amount !== undefined) {
    return { rewardType: 'gold', amount: params.amount };
  }
  const base = params.base ?? 0;
  const perFloor = params.perFloor ?? 0;
  const randMin = params.randMin ?? 1;
  const randMax = params.randMax ?? 1;
  const rand = randMin + rng.next() * (randMax - randMin);
  const amount = Math.floor((base + perFloor * floor) * rand);
  return { rewardType: 'gold', amount };
}

/**
 * レリック: 未所持（pool:'unowned'）から等重み1件。
 * 全所持で候補が無い場合は装備rareへ振替（reward-tables.tsコメントの規則）。
 */
function resolveRelic(ownedRelics: readonly string[], masters: RewardMasters, rng: Rng): ResolvedRewardItem {
  const candidates = masters.relics.filter((r) => !ownedRelics.includes(r.code));
  if (candidates.length === 0) {
    const rareEquip = masters.equipment.filter((e) => e.rarity === 'rare');
    if (rareEquip.length === 0) throw new RangeError('resolveRelic: no rare equipment fallback available');
    return { rewardType: 'equipment', code: rng.pick(rareEquip).code };
  }
  return { rewardType: 'relic', code: rng.pick(candidates).code };
}

function resolveEntryContent(
  entry: RewardEntry,
  floor: number,
  ownedRelics: readonly string[],
  masters: RewardMasters,
  rng: Rng,
): ResolvedRewardItem {
  switch (entry.rewardType) {
    case 'equipment':
      return resolveEquipment(entry, masters, rng);
    case 'consumable':
      return resolveConsumable(entry).pick(rng);
    case 'gold':
      return resolveGold(entry, floor, rng);
    case 'relic':
      return resolveRelic(ownedRelics, masters, rng);
  }
}

/**
 * reward_tables 1テーブルを抽選する。
 * 戻り値は「重み抽選プールからの1件（プールが存在する場合）」+「適用されたguaranteed行」の配列。
 * rt_battle_normal等: weightedのみ1件。rt_boss/rt_treasure_secret: guaranteed中心。
 */
export function resolveRewardTable(
  table: RewardTableMaster,
  floor: number,
  ownedRelics: readonly string[],
  masters: RewardMasters,
  rng: Rng,
): ResolvedRewardItem[] {
  const results: ResolvedRewardItem[] = [];

  const weightedPool = table.entries.filter((e) => !e.guaranteed && e.weight > 0);
  if (weightedPool.length > 0) {
    const picked = rng.weighted(weightedPool.map((e) => ({ item: e, weight: e.weight })));
    results.push(resolveEntryContent(picked, floor, ownedRelics, masters, rng));
  }

  const guaranteedEntries = table.entries.filter((e) => e.guaranteed);
  for (const entry of guaranteedEntries) {
    const applies = entry.chancePct === undefined || rng.next() * 100 < entry.chancePct;
    if (!applies) continue;
    results.push(resolveEntryContent(entry, floor, ownedRelics, masters, rng));
  }

  return results;
}
