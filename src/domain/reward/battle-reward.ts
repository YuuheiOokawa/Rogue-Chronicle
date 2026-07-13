// 戦闘勝利報酬の算定（docs/20 §2.18）。
//
// 実装判断（docs間の不一致）: ゴールド式は 16_Battle_Design.md §9.1 / 19_Enemy_AI_Design.md §9.2 では
// 「Σ baseGold × 階層係数 × rand(0.9〜1.1)」（乱数は合計に対し1回）だが、
// 20_Detailed_Design.md §2.18 の処理手順は「Σ rng.int(baseGold×0.8, baseGold×1.2) × 階層係数」
// （敵ごとに独立乱数）としており、今回の実装指示も後者と一致するため 20章の式を採用した。
//
// Phase7: dropsの中身抽選 + soulShards算出を追加。
// 【ドロップ発生率の設計方針（コード冒頭コメントで明記の指示分）】
// 発生率判定（通常10%/強敵30%/エリート50%/ボス100%。DROP_CHANCE_PCT_BY_ENEMY_TYPE）は
// 本関数の外＝呼び出し側（API/UseCase層）が戦闘単位で1回判定する設計を採用する。
// 呼び出し側は「発生した」と判定した場合のみ dropTableCode（例: rt_battle_elite）を渡し、
// 本関数はそのテーブルの「中身抽選」のみを担当する（dropTableCode=null なら drops=[]）。
// 理由: 1戦闘で複数種の敵が混在しても、実際の抽選はdocs/17 §10.3の「サーバー権威・rngCursor復元による
// 再現性検証」と相性が良いよう1戦闘=1回のドロップ判定に単純化するため（MVP範囲の簡略化、
// 複数ドロップに拡張する場合は将来のschemaVersion更新で対応する）。
// gold型のreward_tablesエントリが抽選された場合はdrops配列に入れず、BattleReward.goldへ合算する
// （purchaseとの整合: goldはdrops UIではなく通貨表示にまとめるため）。
import type { EnemyMaster, RewardTableMaster } from '@/constants/masters/types';
import type { Rng } from '@/domain/shared/rng';

import { resolveRewardTable, type RewardMasters } from './resolve-reward-table';

export interface DefeatedEnemyReward {
  baseExp: number;
  baseGold: number;
  /** ソウルシャード算出用（docs/05 §5.4）。省略時は'normal'扱い */
  enemyType?: EnemyMaster['enemyType'];
}

export interface DropItem {
  itemType: 'equipment' | 'gold' | 'consumable' | 'relic';
  code: string;
}

export interface BattleReward {
  gold: number;
  exp: number;
  drops: DropItem[];
  /** 撃破した敵から得るソウルシャード（docs/05 §5.4: 通常+4/強敵+8/エリート+15/ボス+40） */
  soulShards: number;
}

/** ソウルシャード獲得目安（docs/05_Game_Design.md §5.4）。宝箱・イベント分はこの関数の対象外 */
const SOUL_SHARDS_BY_ENEMY_TYPE: Record<EnemyMaster['enemyType'], number> = {
  normal: 4,
  strong: 8,
  elite: 15,
  boss: 40,
};

export interface BattleRewardMasters extends RewardMasters {
  rewardTables: readonly RewardTableMaster[];
}

/**
 * calculateBattleReward（docs/20 §2.18）。
 * exp = round(Σ baseExp × (1 + 0.10 × (floor - 1)) × expMod)
 * gold = round(Σ rng.int(baseGold×0.8, baseGold×1.2) × (1 + 0.10 × (floor - 1)) × rewardMod) + ドロップ由来gold
 * soulShards = Σ SOUL_SHARDS_BY_ENEMY_TYPE[enemyType]
 * 召喚された敵（isSummon由来）はdefeatedに含めないこと（呼び出し側の責務。docs/19実装注意10）。
 */
export function calculateBattleReward(
  defeated: readonly DefeatedEnemyReward[],
  floor: number,
  expMod: number,
  rewardMod: number,
  dropTableCode: string | null,
  ownedRelics: readonly string[],
  masters: BattleRewardMasters,
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
  let gold = Math.round(goldSum * floorCoefficient * rewardMod);

  const soulShards = defeated.reduce(
    (sum, e) => sum + SOUL_SHARDS_BY_ENEMY_TYPE[e.enemyType ?? 'normal'],
    0,
  );

  const drops: DropItem[] = [];
  if (dropTableCode !== null) {
    const table = masters.rewardTables.find((t) => t.code === dropTableCode);
    if (!table) throw new RangeError(`calculateBattleReward: unknown dropTableCode=${dropTableCode}`);
    const resolved = resolveRewardTable(table, floor, ownedRelics, masters, rng);
    for (const item of resolved) {
      if (item.rewardType === 'gold') {
        gold += item.amount ?? 0;
      } else if (item.code) {
        drops.push({ itemType: item.rewardType, code: item.code });
      }
    }
  }

  return { gold, exp, drops, soulShards };
}
