// 報酬抽選テーブル（docs/17 §8・DEC-041/DEC-044 / docs/19 §9.3・DEC-052）
// entries: 重み抽選行（weight>0）+ 確定付与行（guaranteed=true、chancePctは追加抽選率）
// params規約:
//   equipment  → { rarityWeights: {common?, rare?, epic?} }（該当レア度内は等重み抽選）
//   gold       → { base, perFloor, randMin, randMax } = floor((base+perFloor×階層)×rand) / { amount } = 固定額
//   consumable → { itemWeights: {potion?, hi_potion?, antidote?} }（所持上限超過は+10G換算）
//   relic      → { pool: 'unowned' }（未所持から等重み。全所持時は装備rareへ振替）
import type { ENEMY_TYPES, RewardTableMaster } from './types';

// 敵ドロップ発生率（戦闘単位で1回判定。docs/19 §9.3が確定値。ISSUE-112解消済み）
export const DROP_CHANCE_PCT_BY_ENEMY_TYPE: Record<(typeof ENEMY_TYPES)[number], number> = {
  normal: 10,
  strong: 30,
  elite: 50,
  boss: 100, // 固定+抽選（rt_bossのguaranteed行）
};

export const REWARD_TABLES: RewardTableMaster[] = [
  {
    code: 'rt_battle_normal',
    description: '通常敵ドロップ（発生率10%）: 消耗品60 / 装備common35 / 装備rare5',
    entries: [
      {
        weight: 60,
        rewardType: 'consumable',
        params: { itemWeights: { potion: 50, hi_potion: 20, antidote: 30 } },
      },
      { weight: 35, rewardType: 'equipment', params: { rarityWeights: { common: 100 } } },
      { weight: 5, rewardType: 'equipment', params: { rarityWeights: { rare: 100 } } },
    ],
  },
  {
    code: 'rt_battle_strong',
    description: '強敵ドロップ（発生率30%）: 装備common50 / 装備rare40 / 消耗品10',
    entries: [
      { weight: 50, rewardType: 'equipment', params: { rarityWeights: { common: 100 } } },
      { weight: 40, rewardType: 'equipment', params: { rarityWeights: { rare: 100 } } },
      {
        weight: 10,
        rewardType: 'consumable',
        params: { itemWeights: { potion: 50, hi_potion: 20, antidote: 30 } },
      },
    ],
  },
  {
    code: 'rt_battle_elite',
    description: 'エリートドロップ（発生率50%）: 装備rare60 / 装備epic20 / レリック20',
    entries: [
      { weight: 60, rewardType: 'equipment', params: { rarityWeights: { rare: 100 } } },
      { weight: 20, rewardType: 'equipment', params: { rarityWeights: { epic: 100 } } },
      { weight: 20, rewardType: 'relic', params: { pool: 'unowned' } },
    ],
  },
  {
    code: 'rt_boss',
    description: 'ボス報酬（発生率100%）: レリック1個確定 + 装備epicを50%で追加',
    entries: [
      { weight: 0, rewardType: 'relic', params: { pool: 'unowned' }, guaranteed: true },
      {
        weight: 0,
        rewardType: 'equipment',
        params: { rarityWeights: { epic: 100 } },
        guaranteed: true,
        chancePct: 50,
      },
    ],
  },
  {
    code: 'rt_treasure_normal',
    description: '宝箱（TREASURE）: 装備60 / ゴールド25 / 消耗品15（docs/17 §8 DEC-044）',
    entries: [
      {
        weight: 60,
        rewardType: 'equipment',
        params: { rarityWeights: { common: 50, rare: 40, epic: 10 } },
      },
      {
        weight: 25,
        rewardType: 'gold',
        // floor((40 + 10×階層) × rand(0.9〜1.1))。例: 階層5 → 81〜99G
        params: { base: 40, perFloor: 10, randMin: 0.9, randMax: 1.1 },
      },
      {
        weight: 15,
        rewardType: 'consumable',
        params: { itemWeights: { potion: 50, hi_potion: 20, antidote: 30 } },
      },
    ],
  },
  {
    code: 'rt_treasure_secret',
    description: '隠し部屋（SECRET）: rare以上確定の装備1個（rare60/epic40）+ 固定60G（DEC-041）',
    entries: [
      { weight: 100, rewardType: 'equipment', params: { rarityWeights: { rare: 60, epic: 40 } } },
      { weight: 0, rewardType: 'gold', params: { amount: 60 }, guaranteed: true },
    ],
  },
];
