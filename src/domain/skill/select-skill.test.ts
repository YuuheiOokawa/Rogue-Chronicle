import { describe, expect, it } from 'vitest';

import { SKILLS } from '@/constants/masters/skills';

import { HEAL_FALLBACK_SKILL_CODE } from './generate-choices';
import { applySkillChoice } from './select-skill';

const masters = { skills: SKILLS };

describe('applySkillChoice', () => {
  it('新規スキルは所持へ追加される（8枠未満）', () => {
    const owned = [{ code: 'skill_flame_slash', level: 1 }];
    const result = applySkillChoice(
      owned,
      { skillCode: 'skill_power_strike', isUpgrade: false, rarity: 'common' },
      masters,
    );
    expect(result.ownedSkills).toEqual([
      { code: 'skill_flame_slash', level: 1 },
      { code: 'skill_power_strike', level: 1 },
    ]);
  });

  it('強化はLv+1になる（maxLevelで頭打ち）', () => {
    const owned = [{ code: 'skill_power_strike', level: 2 }];
    const result = applySkillChoice(
      owned,
      { skillCode: 'skill_power_strike', isUpgrade: true, rarity: 'common' },
      masters,
    );
    expect(result.ownedSkills).toEqual([{ code: 'skill_power_strike', level: 3 }]);

    const maxed = applySkillChoice(
      result.ownedSkills,
      { skillCode: 'skill_power_strike', isUpgrade: true, rarity: 'common' },
      masters,
    );
    expect(maxed.ownedSkills).toEqual([{ code: 'skill_power_strike', level: 3 }]);
  });

  it('HEAL_FALLBACK_SKILL_CODEはownedSkillsを変更しない', () => {
    const owned = [{ code: 'skill_flame_slash', level: 1 }];
    const result = applySkillChoice(
      owned,
      { skillCode: HEAL_FALLBACK_SKILL_CODE, isUpgrade: false, rarity: 'common' },
      masters,
    );
    expect(result.ownedSkills).toEqual(owned);
  });

  it('8枠満杯で新規追加時は先頭（最古）と入れ替える', () => {
    const owned = Array.from({ length: 8 }, (_, i) => ({ code: `skill_${i}`, level: 1 }));
    const result = applySkillChoice(
      owned,
      { skillCode: 'skill_new', isUpgrade: false, rarity: 'common' },
      masters,
    );
    expect(result.ownedSkills).toHaveLength(8);
    expect(result.ownedSkills[0].code).toBe('skill_1');
    expect(result.ownedSkills[7].code).toBe('skill_new');
    expect(result.ownedSkills.some((s) => s.code === 'skill_0')).toBe(false);
  });
});
