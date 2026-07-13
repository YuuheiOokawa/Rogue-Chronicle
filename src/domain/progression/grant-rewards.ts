// finalize（API-307）時の永続報酬差分の計算（docs/20 §2.30 grantPersistentRewards★詳細）。
// 純粋関数: DB書き込みは一切行わず、UseCaseが機械的にDBへ反映できる「差分の完全な記述」を返す。
//
// 【実装指示の疑似コードからの差分・設計判断】
// 1. 疑似コードのシグネチャは `grantPersistentRewards(run, player, masters)` だが、
//    accumulateStats（totalClears/totalDefeatsの増分）はランの結果（クリア/敗北/リタイア）を
//    知らなければ計算できない。RunState自体には「結果」を表すフィールドが無い
//    （status列はDB側でありRunStateのスコープ外）ため、本実装では `outcome: RunOutcome`
//    （'cleared'|'failed'|'retired'）を明示引数として追加した。呼び出し側は
//    completeDungeon/failDungeon/retireDungeonのいずれを呼んだかで自明に決まる値を渡せばよい。
// 2. `runId` も transactions[].refId 用に追加引数とした（疑似コードのrun.idに相当。
//    RunStateにはidが無くDB側のUUIDのため）。
// 3. 図鑑差分（collectEncountered）: run_state.skills/relics/equipmentは「現在所持」のみを追い、
//    途中で外れたもの（休憩でのスキル削除等）を再現できないため、Phase7で追加した
//    run_state.encountered（累積遭遇リスト）と現在所持リストの和集合を「今回遭遇した」とみなす
//    設計判断とした（run-state.tsのencounteredフィールドコメント参照）。
//    enemiesはapply-effects.ts（startBattle効果）経由分のみ捕捉できる。通常のBATTLE/STRONG/ELITE/
//    BOSSノードでの遭遇はselect-node.ts/start-battle.ts（本タスクでは変更禁止）側の責務として
//    別途 encountered.enemies へ追記する改修が必要になる（未実装の既知ギャップとしてコメントに明記）。
// 4. codexRatePct: masters（skills/relics/enemies/equipment/characters）の総数に対する
//    「今回のfinalizeで確定した後の図鑑登録数」の割合（floor丸め）として算出する
//    （実績ach_codex_50の判定に必要。docs未記載のため実装判断）。
import type {
  AchievementMaster,
  CharacterMaster,
  EnemyMaster,
  EquipmentMaster,
  RelicMaster,
  SkillMaster,
} from '@/constants/masters/types';
import type { RunState } from '@/domain/dungeon/run-state';

import { evaluateAchievementCondition, type PlayerStatsSnapshot } from './achievement-conditions';
import { addRankExp, type RankProgress } from './rank';

export type RunOutcome = 'cleared' | 'failed' | 'retired';

export type CodexEntryType = 'skill' | 'relic' | 'enemy' | 'equipment' | 'character';

export interface CodexEntry {
  entryType: CodexEntryType;
  entryCode: string;
}

export function codexKey(entry: CodexEntry): string {
  return `${entry.entryType}:${entry.entryCode}`;
}

export interface PlayerProgressData extends RankProgress {
  totalRuns: number;
  totalClears: number;
  totalDefeats: number;
  totalKills: number;
  eliteKills: number;
  bestFloor: number;
}

export interface PlayerPersistentData {
  progress: PlayerProgressData;
  /** `codexKey({entryType,entryCode})` の集合（player_codexの既存登録） */
  codex: ReadonlySet<string>;
  /** 解除済み実績code */
  achievements: ReadonlySet<string>;
  /** 解放済みキャラcode */
  characters: ReadonlySet<string>;
}

export interface GrantRewardsMasters {
  achievements: readonly AchievementMaster[];
  skills: readonly SkillMaster[];
  relics: readonly RelicMaster[];
  enemies: readonly EnemyMaster[];
  equipment: readonly EquipmentMaster[];
  characters: readonly CharacterMaster[];
}

export interface CurrencyTransactionGrant {
  currency: 'soul_shards';
  amount: number;
  reason: 'run_finalize';
  refId: string;
}

export interface PersistentGrant {
  soulShards: number;
  /** ランクアップ・累計統計をすべて反映した更新後progress（DBへそのままUPDATEできる形） */
  progress: PlayerProgressData;
  /** 今回のfinalizeで発生したランクアップ回数 */
  rankLeveledUp: number;
  /** player_codexへ INSERT すべき未登録分 */
  codexDiff: CodexEntry[];
  /** 新規解除された実績code */
  unlockedAchievements: string[];
  /** 新規解放されたキャラcode（実績連動） */
  unlockedCharacters: string[];
  transactions: CurrencyTransactionGrant[];
}

function collectEncountered(run: RunState): CodexEntry[] {
  const skillCodes = new Set([...run.encountered.skills, ...run.skills.map((s) => s.code)]);
  const relicCodes = new Set([...run.encountered.relics, ...run.relics]);
  const equipmentCodes = new Set([
    ...run.encountered.equipment,
    ...[run.equipment.weapon, run.equipment.armor, run.equipment.accessory].filter(
      (c): c is string => c !== null,
    ),
  ]);
  const enemyCodes = new Set(run.encountered.enemies);

  const entries: CodexEntry[] = [];
  for (const code of skillCodes) entries.push({ entryType: 'skill', entryCode: code });
  for (const code of relicCodes) entries.push({ entryType: 'relic', entryCode: code });
  for (const code of equipmentCodes) entries.push({ entryType: 'equipment', entryCode: code });
  for (const code of enemyCodes) entries.push({ entryType: 'enemy', entryCode: code });
  return entries;
}

/** grantPersistentRewards（docs/20 §2.30。設計判断はファイル冒頭コメント参照） */
export function grantPersistentRewards(
  run: RunState,
  outcome: RunOutcome,
  player: PlayerPersistentData,
  masters: GrantRewardsMasters,
  runId: string,
): PersistentGrant {
  const shards = run.earned.soulShards; // complete/fail/retireで係数適用済み（domain/dungeon/finalize-status.ts）

  const rankResult = addRankExp(player.progress, run.earned.rankExp);

  const updatedProgress: PlayerProgressData = {
    rank: rankResult.rank,
    rankExp: rankResult.rankExp,
    totalRuns: player.progress.totalRuns + 1,
    totalClears: player.progress.totalClears + (outcome === 'cleared' ? 1 : 0),
    totalDefeats: player.progress.totalDefeats + (outcome === 'failed' ? 1 : 0),
    totalKills: player.progress.totalKills + run.earned.kills,
    eliteKills: player.progress.eliteKills + run.earned.eliteKills,
    bestFloor: Math.max(player.progress.bestFloor, run.position.floor),
  };

  const encountered = collectEncountered(run);
  const codexDiff = encountered.filter((e) => !player.codex.has(codexKey(e)));

  const codexTotal =
    masters.skills.length +
    masters.relics.length +
    masters.enemies.length +
    masters.equipment.length +
    masters.characters.length;
  const codexRegisteredAfter = player.codex.size + codexDiff.length;
  const codexRatePct = codexTotal > 0 ? Math.floor((codexRegisteredAfter / codexTotal) * 100) : 0;

  const stats: PlayerStatsSnapshot = {
    totalRuns: updatedProgress.totalRuns,
    totalClears: updatedProgress.totalClears,
    totalDefeats: updatedProgress.totalDefeats,
    totalKills: updatedProgress.totalKills,
    eliteKills: updatedProgress.eliteKills,
    bestFloor: updatedProgress.bestFloor,
    runLevel: run.character.level,
    runRelicsHeld: run.relics.length,
    runGoldHeld: run.gold,
    codexRatePct,
  };

  const newlyUnlockedAchievements = masters.achievements.filter(
    (a) => !player.achievements.has(a.code) && evaluateAchievementCondition(a.condition, stats),
  );

  const unlockedCharacters = [
    ...new Set(
      newlyUnlockedAchievements
        .filter((a) => a.reward?.type === 'characterUnlock')
        .map((a) => (a.reward as { type: 'characterUnlock'; value: string }).value)
        .filter((code) => !player.characters.has(code)),
    ),
  ];

  return {
    soulShards: shards,
    progress: updatedProgress,
    rankLeveledUp: rankResult.leveledUp,
    codexDiff,
    unlockedAchievements: newlyUnlockedAchievements.map((a) => a.code),
    unlockedCharacters,
    transactions: [{ currency: 'soul_shards', amount: shards, reason: 'run_finalize', refId: runId }],
  };
}
