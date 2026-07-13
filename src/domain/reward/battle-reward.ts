// 戦闘勝利報酬の算定（docs/20 §2.18）。
// ドロップ抽選はreward_tables実装待ち（Phase7）のため、Phase6ではgold/expのみ算定しdropsは空配列固定。
//
// 実装判断（docs間の不一致）: ゴールド式は 16_Battle_Design.md §9.1 / 19_Enemy_AI_Design.md §9.2 では
// 「Σ baseGold × 階層係数 × rand(0.9〜1.1)」（乱数は合計に対し1回）だが、
// 20_Detailed_Design.md §2.18 の処理手順は「Σ rng.int(baseGold×0.8, baseGold×1.2) × 階層係数」
// （敵ごとに独立乱数）としており、今回の実装指示も後者と一致するため 20章の式を採用した。
import type { Rng } from '@/domain/shared/rng';

export interface DefeatedEnemyReward {
  baseExp: number;
  baseGold: number;
}

export interface DropItem {
  itemType: 'equipment' | 'gold' | 'consumable' | 'relic';
  code: string;
}

export interface BattleReward {
  gold: number;
  exp: number;
  /** Phase6では常に空配列（ドロップ抽選はPhase7でreward_tables実装後に追加） */
  drops: DropItem[];
}

/**
 * calculateBattleReward（docs/20 §2.18）。
 * exp = round(Σ baseExp × (1 + 0.10 × (floor - 1)) × expMod)
 * gold = round(Σ rng.int(baseGold×0.8, baseGold×1.2) × (1 + 0.10 × (floor - 1)) × rewardMod)
 * 召喚された敵（isSummon由来）はdefeatedに含めないこと（呼び出し側の責務。docs/19実装注意10）。
 */
export function calculateBattleReward(
  defeated: readonly DefeatedEnemyReward[],
  floor: number,
  expMod: number,
  rewardMod: number,
  rng: Rng,
): BattleReward {
  const floorCoefficient = 1 + 0.1 * (floor - 1);

  const exp = Math.round(
    defeated.reduce((sum, e) => sum + e.baseExp, 0) * floorCoefficient * expMod,
  );

  const goldSum = defeated.reduce((sum, e) => {
    const min = Math.round(e.baseGold * 0.8);
    const max = Math.round(e.baseGold * 1.2);
    return sum + rng.int(min, max);
  }, 0);
  const gold = Math.round(goldSum * floorCoefficient * rewardMod);

  return { gold, exp, drops: [] };
}
