// キャラクターAPI（API-201/202）のレスポンス組み立て。
// マスタ参照はDBではなく定数（src/constants/masters）を使う（シードで同期済み）。
import { ACHIEVEMENTS, CHARACTERS, SKILLS } from '@/constants/masters';
import type { CharacterMaster } from '@/constants/masters/types';
import {
  achievementProgressValue,
  canAffordUnlock,
  type ProgressStats,
} from '@/domain/progression/unlock-condition';
import type {
  CharacterDetailResponse,
  CharacterListItem,
  CharacterStatsView,
  SkillView,
  UnlockConditionView,
} from '@/types/api';

/** キャラタイプ表示ラベル（CORE_SPEC §5.5「タイプ」列。マスタに列がないためここで保持） */
const CHARACTER_TYPE_LABELS: Record<string, string> = {
  swordsman_rain: '剣士・バランス',
  mage_lilia: '魔導士・スキル攻撃',
  rogue_gald: '盗賊・速攻クリ',
};

export interface CharacterViewContext {
  soulShards: number;
  progress: ProgressStats;
}

export function findCharacterMaster(code: string): CharacterMaster | undefined {
  return CHARACTERS.find((c) => c.code === code);
}

export function sortedCharacterMasters(): CharacterMaster[] {
  return [...CHARACTERS].sort((a, b) => a.sortOrder - b.sortOrder);
}

function uniqueAbilityOf(character: CharacterMaster): { name: string; description: string } {
  const innate = SKILLS.find((s) => s.code === character.innateSkillCode);
  return {
    name: innate?.name ?? character.innateSkillCode,
    description: innate?.description ?? '',
  };
}

function statsViewOf(character: CharacterMaster): CharacterStatsView {
  const { maxHp, atk, def, spd, critRate } = character.baseStats;
  return { maxHp, atk, def, spd, critRate };
}

/** 未解放キャラの解放条件表示情報（解放済みはnullを返す側で制御） */
function unlockConditionViewOf(
  character: CharacterMaster,
  ctx: CharacterViewContext,
): UnlockConditionView | null {
  const condition = character.unlockCondition;
  if (condition.type === 'shards') {
    return {
      type: 'shards',
      requiredShards: condition.amount,
      canUnlock: canAffordUnlock(condition, ctx.soulShards),
    };
  }
  if (condition.type === 'achievement') {
    const achievement = ACHIEVEMENTS.find((a) => a.code === condition.achievementCode);
    return {
      type: 'achievement',
      achievementCode: condition.achievementCode,
      achievementName: achievement?.name ?? condition.achievementCode,
      progress: achievement
        ? achievementProgressValue(achievement.condition.type, ctx.progress)
        : 0,
      goal: achievement?.condition.value ?? 0,
    };
  }
  return null; // initial型が未解放になることは通常ない
}

/** API-201の1件分。未解放キャラは数値ステータスをマスクする（docs/09 SCR-105） */
export function buildCharacterListItem(
  character: CharacterMaster,
  unlocked: boolean,
  ctx: CharacterViewContext,
): CharacterListItem {
  return {
    code: character.code,
    name: character.name,
    type: CHARACTER_TYPE_LABELS[character.code] ?? '',
    element: character.element,
    unlocked,
    baseStats: unlocked ? statsViewOf(character) : null,
    uniqueAbility: uniqueAbilityOf(character),
    unlockCondition: unlocked ? null : unlockConditionViewOf(character, ctx),
  };
}

/** API-202レスポンス。未解放キャラはbaseStats/growthRatesをマスク（数値を返さない） */
export function buildCharacterDetail(
  character: CharacterMaster,
  unlocked: boolean,
  ctx: CharacterViewContext,
): CharacterDetailResponse {
  const initialSkills: SkillView[] = character.initialSkillCodes
    .map((code) => SKILLS.find((s) => s.code === code))
    .filter((s) => s !== undefined)
    .map((s) => ({
      code: s.code,
      name: s.name,
      description: s.description,
      element: s.element,
      spCost: s.spCost,
    }));

  return {
    ...buildCharacterListItem(character, unlocked, ctx),
    description: character.description,
    favoredWeaponType: character.favoredWeaponType,
    growthRates: unlocked ? { ...character.growthRates } : null,
    initialSkills,
  };
}
