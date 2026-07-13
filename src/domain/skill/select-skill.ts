// スキル3択からの選択適用（docs/20 §2.22 selectSkill の「pick」部分 / CORE_SPEC §5.8）。
//
// スコープ: 本ファイルはpick（choices[choiceIndex]を確定適用する処理）のみを純粋関数として提供する。
// reroll（generateSkillChoicesの再抽選 + rerollRemaining減算）とskip（HP10%回復）、
// および pendingReward.claimed=true への遷移・レベルアップキュー消化は
// 呼び出し側（server/usecases、Stage2）の責務とする（docs/20 §2.22の手順3-5に相当）。
//
// 【フォールバックカードの扱い】choice.skillCode === HEAL_FALLBACK_SKILL_CODE の場合、
// このスキルはマスタに実在しないため所持スキルへ追加しない。HP10%回復の適用は
// 呼び出し側がこのコードを判定して別途行うこと（本関数はownedSkillsのみを返す設計のため）。
//
// 【8枠超過時の入替ルール（実装判断）】
// generateSkillChoicesは8枠満杯時は強化候補のみを提示するため、通常は新規追加で
// 8枠を超えることは起きない。防御的に、万一 isUpgrade=false かつ ownedSkills.length>=8 の
// 入力が来た場合は「配列の先頭（最も古く習得したスキル）」を新スキルと入れ替える。
import type { SkillMaster } from '@/constants/masters/types';

import { HEAL_FALLBACK_SKILL_CODE, type OwnedSkillRef, type SkillChoice } from './generate-choices';

export interface ApplySkillChoiceResult {
  ownedSkills: OwnedSkillRef[];
}

export function applySkillChoice(
  ownedSkills: readonly OwnedSkillRef[],
  choice: SkillChoice,
  masters: { skills: readonly SkillMaster[] },
): ApplySkillChoiceResult {
  if (choice.skillCode === HEAL_FALLBACK_SKILL_CODE) {
    return { ownedSkills: [...ownedSkills] };
  }

  if (choice.isUpgrade) {
    const master = masters.skills.find((s) => s.code === choice.skillCode);
    const maxLevel = master?.maxLevel ?? 3;
    return {
      ownedSkills: ownedSkills.map((s) =>
        s.code === choice.skillCode ? { ...s, level: Math.min(maxLevel, s.level + 1) } : s,
      ),
    };
  }

  // 新規習得
  if (ownedSkills.length >= 8) {
    const [, ...rest] = ownedSkills;
    return { ownedSkills: [...rest, { code: choice.skillCode, level: 1 }] };
  }
  return { ownedSkills: [...ownedSkills, { code: choice.skillCode, level: 1 }] };
}
