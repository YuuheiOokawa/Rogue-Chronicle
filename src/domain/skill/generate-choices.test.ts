import { describe, expect, it } from 'vitest';

import { SKILLS } from '@/constants/masters/skills';
import { createRng } from '@/domain/shared/rng';

import { generateSkillChoices, HEAL_FALLBACK_SKILL_CODE } from './generate-choices';

const masters = { skills: SKILLS };

describe('generateSkillChoices', () => {
  it('常に3件返し、重複がない', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const choices = generateSkillChoices([], 'swordsman_rain', masters, createRng(seed));
      expect(choices).toHaveLength(3);
      const codes = choices.map((c) => c.skillCode);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('固有スキル(isInnate)は候補に出ない', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const choices = generateSkillChoices([], 'swordsman_rain', masters, createRng(seed));
      for (const c of choices) {
        const master = SKILLS.find((s) => s.code === c.skillCode);
        if (master) expect(master.isInnate).toBe(false);
      }
    }
  });

  it('Lv3（maxLevel到達）のスキルは強化候補に出ない', () => {
    const owned = [{ code: 'skill_power_strike', level: 3 }];
    for (let seed = 1; seed <= 200; seed += 1) {
      const choices = generateSkillChoices(owned, 'swordsman_rain', masters, createRng(seed));
      const hit = choices.find((c) => c.skillCode === 'skill_power_strike');
      expect(hit).toBeUndefined();
    }
  });

  it('所持済みLv1/2のスキルが選ばれた場合はisUpgrade=trueになる', () => {
    // 全汎用スキルを所持済み(Lv1)にして、候補が強化のみになる状況を作る
    const owned = masters.skills.filter((s) => !s.isInnate).map((s) => ({ code: s.code, level: 1 }));
    const choices = generateSkillChoices(owned, 'swordsman_rain', masters, createRng(5));
    for (const c of choices) {
      if (c.skillCode !== HEAL_FALLBACK_SKILL_CODE) {
        expect(c.isUpgrade).toBe(true);
      }
    }
  });

  it('8枠満杯なら新規候補は出ず、強化候補のみで構成される', () => {
    const owned = [
      { code: 'skill_flame_slash', level: 1 },
      { code: 'skill_power_strike', level: 1 },
      { code: 'skill_poison_stab', level: 1 },
      { code: 'skill_first_aid', level: 1 },
      { code: 'skill_war_cry', level: 1 },
      { code: 'skill_stone_skin', level: 1 },
      { code: 'skill_keen_eyes', level: 1 },
      { code: 'skill_meditate', level: 1 },
    ];
    for (let seed = 1; seed <= 50; seed += 1) {
      const choices = generateSkillChoices(owned, 'swordsman_rain', masters, createRng(seed));
      for (const c of choices) {
        if (c.skillCode === HEAL_FALLBACK_SKILL_CODE) continue;
        expect(c.isUpgrade).toBe(true);
      }
    }
  });

  it('候補プールが3件未満ならHEAL_FALLBACK_SKILL_CODEで埋める', () => {
    // 全スキルをLv3（強化不可）にし、8枠未満のままにすることで新規候補=0・強化候補=0にする
    const ownedButMaxed = masters.skills.filter((s) => !s.isInnate).map((s) => ({ code: s.code, level: 3 }));
    const choices = generateSkillChoices(ownedButMaxed, 'swordsman_rain', masters, createRng(1));
    expect(choices).toHaveLength(3);
    expect(choices.every((c) => c.skillCode === HEAL_FALLBACK_SKILL_CODE)).toBe(true);
  });

  it('レア度重みがおおよそcommon60/rare30/epic10に従う（大数統計、新規候補が豊富な条件で計測）', () => {
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0 };
    const N = 3000;
    for (let seed = 1; seed <= N; seed += 1) {
      const choices = generateSkillChoices([], 'swordsman_rain', masters, createRng(seed));
      for (const c of choices) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    }
    const total = N * 3;
    expect(counts.common / total).toBeGreaterThan(0.5);
    expect(counts.epic / total).toBeLessThan(0.2);
  });

  it('他キャラ専用スキルは候補に出ない', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const choices = generateSkillChoices([], 'swordsman_rain', masters, createRng(seed));
      for (const c of choices) {
        const master = SKILLS.find((s) => s.code === c.skillCode);
        if (master) expect(master.characterCode === null || master.characterCode === 'swordsman_rain').toBe(true);
      }
    }
  });
});
