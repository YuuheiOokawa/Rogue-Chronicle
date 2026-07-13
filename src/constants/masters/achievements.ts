// 実績マスタ 10個（docs/05_Game_Design.md §4.5 完全転記）
// ach_runs_10（ACH-004）の報酬 = キャラ「ガルド」解放（累計ラン10回・結果不問）
import type { AchievementMaster } from './types';

export const ACHIEVEMENTS: AchievementMaster[] = [
  {
    code: 'ach_first_run', // ACH-001
    name: '最初の一歩',
    description: 'ランを1回終了する（結果不問）。',
    condition: { type: 'totalRuns', value: 1 },
    reward: { type: 'shards', value: 50 },
    sortOrder: 1,
  },
  {
    code: 'ach_first_defeat', // ACH-002
    name: '敗北は記録される',
    description: '初めて敗北する。',
    condition: { type: 'totalDefeats', value: 1 },
    reward: { type: 'shards', value: 30 },
    sortOrder: 2,
  },
  {
    code: 'ach_first_clear', // ACH-003
    name: '忘却からの帰還',
    description: '忘却の遺跡を初めてクリアする。',
    condition: { type: 'totalClears', value: 1 },
    reward: { type: 'shards', value: 200 },
    sortOrder: 3,
  },
  {
    code: 'ach_runs_10', // ACH-004
    name: '歴戦の挑戦者',
    description: '累計ラン10回に到達する（結果不問）。',
    condition: { type: 'totalRuns', value: 10 },
    reward: { type: 'characterUnlock', value: 'rogue_gald' },
    sortOrder: 4,
  },
  {
    code: 'ach_kills_100', // ACH-005
    name: '百鬼討伐',
    description: '累計100体の敵を撃破する。',
    condition: { type: 'totalKills', value: 100 },
    reward: { type: 'shards', value: 100 },
    sortOrder: 5,
  },
  {
    code: 'ach_level_20', // ACH-006
    name: '極限成長',
    description: '1ラン内でレベル20に到達する。',
    condition: { type: 'runLevel', value: 20 },
    reward: { type: 'shards', value: 150 },
    sortOrder: 6,
  },
  {
    code: 'ach_elite_first', // ACH-007
    name: '強者を超えて',
    description: 'エリート敵を初めて撃破する。',
    condition: { type: 'eliteKills', value: 1 },
    reward: { type: 'shards', value: 80 },
    sortOrder: 7,
  },
  {
    code: 'ach_relics_5', // ACH-008
    name: '蒐集家',
    description: 'レリックを1ラン中に5個同時所持する。',
    condition: { type: 'runRelicsHeld', value: 5 },
    reward: { type: 'shards', value: 100 },
    sortOrder: 8,
  },
  {
    code: 'ach_gold_1000', // ACH-009
    name: '遺跡の成金',
    description: '1ラン中にゴールドを1000所持する。',
    condition: { type: 'runGoldHeld', value: 1000 },
    reward: { type: 'shards', value: 100 },
    sortOrder: 9,
  },
  {
    code: 'ach_codex_50', // ACH-010
    name: '年代記の書き手',
    description: '図鑑登録率50%に到達する。',
    condition: { type: 'codexRatePct', value: 50 },
    reward: { type: 'shards', value: 150, title: '書き手' },
    sortOrder: 10,
  },
];
