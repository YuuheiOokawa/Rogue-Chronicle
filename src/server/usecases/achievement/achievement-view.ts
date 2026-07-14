// 実績API（API-106）のレスポンス組み立て（docs/13 §4.2、docs/09 SCR-111）。
// マスタ参照はDBではなく定数（src/constants/masters）を使う（characters/character-view.tsと同パターン）。
import { ACHIEVEMENTS, CHARACTERS, ENEMIES, EQUIPMENT, RELICS, SKILLS } from '@/constants/masters';
import type { AchievementMaster } from '@/constants/masters/types';

/** レスポンス型はこのファイルで定義する（src/types/api.tsは他エージェントとの競合防止のため編集しない） */
export interface AchievementListItem {
  code: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  goal: number;
}

export interface AchievementsResponse {
  items: AchievementListItem[];
}

/** progress算出に必要な永続統計（player_progress由来）+ 図鑑登録件数 */
export interface AchievementProgressContext {
  totalRuns: number;
  totalClears: number;
  totalDefeats: number;
  totalKills: number;
  eliteKills: number;
  bestFloor: number;
  /** player_codexの件数（codexRatePct算出用） */
  codexEntryCount: number;
}

const CODEX_TOTAL_COUNT =
  SKILLS.length + RELICS.length + ENEMIES.length + EQUIPMENT.length + CHARACTERS.length;

export function sortedAchievementMasters(): AchievementMaster[] {
  return [...ACHIEVEMENTS].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 実績1件分のprogressを算出する（docs/13 API-106レスポンス例のprogress/goal）。
 * - totalRuns/totalClears/totalDefeats/totalKills/eliteKills/bestFloor:
 *   player_progressの対応フィールドをそのまま使う（goal到達後も実測値を表示する。
 *   docs例: total_runs_10はgoal=10だがprogress=24＝累計値をそのまま見せる設計）。
 * - codexRatePct: grant-rewards.tsのcodexRatePct算出と同じ考え方（floor丸め）。
 * - runLevel/runRelicsHeld/runGoldHeld: 「1ラン内の瞬間最大値」であり、player_progressに
 *   永続追跡列が無いため一覧画面ではprogressを算出できない（実装判断。docs/28 ISSUE-014参照）。
 *   未解除時は常に0、解除済みなら実質goal到達済みとしてgoalを返す。
 */
function progressValueOf(
  condition: AchievementMaster['condition'],
  ctx: AchievementProgressContext,
  unlocked: boolean,
): number {
  switch (condition.type) {
    case 'totalRuns':
      return ctx.totalRuns;
    case 'totalClears':
      return ctx.totalClears;
    case 'totalDefeats':
      return ctx.totalDefeats;
    case 'totalKills':
      return ctx.totalKills;
    case 'eliteKills':
      return ctx.eliteKills;
    case 'bestFloor':
      return ctx.bestFloor;
    case 'codexRatePct':
      return CODEX_TOTAL_COUNT > 0
        ? Math.floor((ctx.codexEntryCount / CODEX_TOTAL_COUNT) * 100)
        : 0;
    case 'runLevel':
    case 'runRelicsHeld':
    case 'runGoldHeld':
      return unlocked ? condition.value : 0;
    default:
      return 0;
  }
}

export function buildAchievementListItem(
  achievement: AchievementMaster,
  unlocked: boolean,
  unlockedAt: Date | null,
  ctx: AchievementProgressContext,
): AchievementListItem {
  return {
    code: achievement.code,
    name: achievement.name,
    description: achievement.description,
    unlocked,
    unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
    progress: progressValueOf(achievement.condition, ctx, unlocked),
    goal: achievement.condition.value,
  };
}
