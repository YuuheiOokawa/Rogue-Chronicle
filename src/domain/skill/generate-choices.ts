// レベルアップ時のスキル3択候補抽選（docs/20 §2.21 generateSkillChoices / CORE_SPEC §5.8）。
//
// 【フォールバックカードの命名（Stage2向けに明記）】
// 候補プールが3件未満の場合、不足分は特別コード `HEAL_FALLBACK_SKILL_CODE`（'__heal_fallback__'）で
// 埋める。このコードは skills マスタに実在しない“擬似スキル”で、選択時（select-skill.ts /
// 呼び出し側API-502）は通常のスキル所持・強化処理を行わず、代わりにHP10%回復として処理すること。
import type { SkillMaster } from '@/constants/masters/types';
import type { Rng } from '@/domain/shared/rng';

/** プール不足時のフォールバック候補コード（HP10%回復として処理する。select-skill.tsも参照） */
export const HEAL_FALLBACK_SKILL_CODE = '__heal_fallback__';

/** レア度重み（docs/18 §3.1 / CORE_SPEC §5.8: common60/rare30/epic10） */
const RARITY_WEIGHTS: Record<string, number> = { common: 60, rare: 30, epic: 10 };

export interface OwnedSkillRef {
  code: string;
  level: number;
}

export interface SkillChoice {
  skillCode: string;
  isUpgrade: boolean;
  rarity: string;
}

/**
 * generateSkillChoices（docs/20 §2.21）。
 * 候補プール = 「キャラが取得可能（characterCode===null=汎用、またはcharacterCode一致）」かつ
 *   「固有スキル(isInnate)を除く」かつ「未所持、または所持済みでLv<maxLevel（強化候補）」。
 * 所持8枠（ownedSkills.length>=8）が満杯なら新規候補を除外し、強化候補のみで構成する。
 * レア度重みで重複なく3件を「重み付き非復元抽出」する。プールが3件未満なら
 * HEAL_FALLBACK_SKILL_CODEで埋める。
 */
export function generateSkillChoices(
  ownedSkills: readonly OwnedSkillRef[],
  characterCode: string,
  masters: { skills: readonly SkillMaster[] },
  rng: Rng,
): SkillChoice[] {
  const ownedByCode = new Map(ownedSkills.map((s) => [s.code, s.level]));
  const isFull = ownedSkills.length >= 8;

  const pool = masters.skills.filter((s) => {
    if (s.isInnate) return false; // 固有スキルは3択に出ない（枠外・強化不可）
    if (s.characterCode !== null && s.characterCode !== characterCode) return false;
    const ownedLevel = ownedByCode.get(s.code);
    if (ownedLevel === undefined) {
      return !isFull; // 新規習得候補は8枠満杯なら除外
    }
    return ownedLevel < s.maxLevel; // 強化候補（Lv上限未満のみ）
  });

  const remaining = [...pool];
  const picked: SkillChoice[] = [];
  while (picked.length < 3 && remaining.length > 0) {
    const chosen = rng.weighted(
      remaining.map((s) => ({ item: s, weight: RARITY_WEIGHTS[s.rarity] ?? 1 })),
    );
    remaining.splice(remaining.indexOf(chosen), 1);
    const ownedLevel = ownedByCode.get(chosen.code);
    picked.push({ skillCode: chosen.code, isUpgrade: ownedLevel !== undefined, rarity: chosen.rarity });
  }
  while (picked.length < 3) {
    picked.push({ skillCode: HEAL_FALLBACK_SKILL_CODE, isUpgrade: false, rarity: 'common' });
  }

  return picked;
}
