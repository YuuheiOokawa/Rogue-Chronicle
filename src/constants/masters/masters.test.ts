// マスタデータ整合性テスト
// (a) 全データがzodスキーマをパス (b) code重複なし (c) 参照整合 (d) 件数 (e) effect paramsの検証
import { describe, expect, it } from 'vitest';

import { EFFECT_TYPES, effectParamsSchema } from '@/domain/skill/effect-params';

import {
  ACHIEVEMENTS,
  CHARACTERS,
  DUNGEON_NODE_TYPES,
  DUNGEONS,
  ENEMIES,
  EQUIPMENT,
  MASTER_DATA_VERSION,
  RANDOM_EVENTS,
  RELICS,
  REWARD_TABLES,
  SKILLS,
  STORIES,
  UPGRADE_NODES,
  achievementMasterSchema,
  characterMasterSchema,
  dungeonMasterSchema,
  dungeonNodeTypeMasterSchema,
  enemyMasterSchema,
  equipmentMasterSchema,
  guardParamsSchema,
  randomEventMasterSchema,
  relicMasterSchema,
  rewardTableMasterSchema,
  skillMasterSchema,
  storyMasterSchema,
  summonParamsSchema,
  upgradeNodeMasterSchema,
} from './index';

// levelScaling.byLevel の解決（docs/18 §2.5: 低いレベルの差分から順にdeepMerge）
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      out[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function expectNoDuplicates(codes: string[], label: string) {
  const seen = new Set<string>();
  for (const code of codes) {
    expect(seen.has(code), `${label}: code重複 ${code}`).toBe(false);
    seen.add(code);
  }
}

describe('(a) zodスキーマ検証', () => {
  it('characters', () => {
    for (const row of CHARACTERS) expect(() => characterMasterSchema.parse(row)).not.toThrow();
  });
  it('skills', () => {
    for (const row of SKILLS) expect(() => skillMasterSchema.parse(row)).not.toThrow();
  });
  it('equipment', () => {
    for (const row of EQUIPMENT) expect(() => equipmentMasterSchema.parse(row)).not.toThrow();
  });
  it('relics', () => {
    for (const row of RELICS) expect(() => relicMasterSchema.parse(row)).not.toThrow();
  });
  it('enemies', () => {
    for (const row of ENEMIES) expect(() => enemyMasterSchema.parse(row)).not.toThrow();
  });
  it('dungeons', () => {
    for (const row of DUNGEONS) expect(() => dungeonMasterSchema.parse(row)).not.toThrow();
  });
  it('dungeon node types', () => {
    for (const row of DUNGEON_NODE_TYPES)
      expect(() => dungeonNodeTypeMasterSchema.parse(row)).not.toThrow();
  });
  it('random events', () => {
    for (const row of RANDOM_EVENTS) expect(() => randomEventMasterSchema.parse(row)).not.toThrow();
  });
  it('reward tables', () => {
    for (const row of REWARD_TABLES) expect(() => rewardTableMasterSchema.parse(row)).not.toThrow();
  });
  it('upgrade nodes', () => {
    for (const row of UPGRADE_NODES) expect(() => upgradeNodeMasterSchema.parse(row)).not.toThrow();
  });
  it('achievements', () => {
    for (const row of ACHIEVEMENTS) expect(() => achievementMasterSchema.parse(row)).not.toThrow();
  });
  it('stories', () => {
    for (const row of STORIES) expect(() => storyMasterSchema.parse(row)).not.toThrow();
  });
  it('MASTER_DATA_VERSIONはYYYYMMDD.n形式', () => {
    expect(MASTER_DATA_VERSION).toMatch(/^\d{8}\.\d+$/);
  });
});

describe('(b) code重複なし', () => {
  it('各マスタ内でcodeがユニーク', () => {
    expectNoDuplicates(
      CHARACTERS.map((c) => c.code),
      'characters',
    );
    expectNoDuplicates(
      SKILLS.map((s) => s.code),
      'skills',
    );
    expectNoDuplicates(
      EQUIPMENT.map((e) => e.code),
      'equipment',
    );
    expectNoDuplicates(
      RELICS.map((r) => r.code),
      'relics',
    );
    expectNoDuplicates(
      ENEMIES.map((e) => e.code),
      'enemies',
    );
    expectNoDuplicates(
      DUNGEONS.map((d) => d.code),
      'dungeons',
    );
    expectNoDuplicates(
      DUNGEON_NODE_TYPES.map((n) => n.code),
      'dungeon_node_types',
    );
    expectNoDuplicates(
      RANDOM_EVENTS.map((e) => e.code),
      'random_events',
    );
    expectNoDuplicates(
      REWARD_TABLES.map((t) => t.code),
      'reward_tables',
    );
    expectNoDuplicates(
      UPGRADE_NODES.map((u) => u.code),
      'upgrade_nodes',
    );
    expectNoDuplicates(
      ACHIEVEMENTS.map((a) => a.code),
      'achievements',
    );
    expectNoDuplicates(
      STORIES.map((s) => s.code),
      'stories',
    );
  });
  it('敵行動codeが敵内でユニーク', () => {
    for (const enemy of ENEMIES) {
      expectNoDuplicates(
        enemy.actions.map((a) => a.code),
        `enemy ${enemy.code} actions`,
      );
    }
  });
});

describe('(c) 参照整合', () => {
  const skillCodes = new Set(SKILLS.map((s) => s.code));
  const enemyCodes = new Set(ENEMIES.map((e) => e.code));
  const rewardTableCodes = new Set(REWARD_TABLES.map((t) => t.code));
  const upgradeCodes = new Set(UPGRADE_NODES.map((u) => u.code));
  const characterCodes = new Set(CHARACTERS.map((c) => c.code));
  const achievementCodes = new Set(ACHIEVEMENTS.map((a) => a.code));

  it('キャラのinnateSkillCode → skills（is_innate=true・当該キャラ専用）', () => {
    for (const chara of CHARACTERS) {
      const skill = SKILLS.find((s) => s.code === chara.innateSkillCode);
      expect(skill, `${chara.code}.innateSkillCode=${chara.innateSkillCode}`).toBeDefined();
      expect(skill?.isInnate).toBe(true);
      expect(skill?.characterCode).toBe(chara.code);
    }
  });

  it('キャラのinitialSkillCodes → skills（枠内スキル=is_innate false）', () => {
    for (const chara of CHARACTERS) {
      for (const code of chara.initialSkillCodes) {
        expect(skillCodes.has(code), `${chara.code}.initialSkillCodes: ${code}`).toBe(true);
        expect(SKILLS.find((s) => s.code === code)?.isInnate).toBe(false);
      }
    }
  });

  it('スキルのcharacterCode → characters', () => {
    for (const skill of SKILLS) {
      if (skill.characterCode !== null) {
        expect(characterCodes.has(skill.characterCode), `${skill.code}`).toBe(true);
      }
    }
  });

  it('キャラのinitialEquipCode → equipment（isStarter=true）', () => {
    for (const chara of CHARACTERS) {
      expect(chara.initialEquipCode).not.toBeNull();
      const equip = EQUIPMENT.find((e) => e.code === chara.initialEquipCode);
      expect(equip, `${chara.code}.initialEquipCode=${chara.initialEquipCode}`).toBeDefined();
      expect(equip?.isStarter).toBe(true);
    }
  });

  it('キャラのunlockCondition.achievementCode → achievements', () => {
    for (const chara of CHARACTERS) {
      if (chara.unlockCondition.type === 'achievement') {
        expect(achievementCodes.has(chara.unlockCondition.achievementCode)).toBe(true);
      }
    }
  });

  it('敵のaiRules.actionCode → 同一敵のactions', () => {
    for (const enemy of ENEMIES) {
      const actionCodes = new Set(enemy.actions.map((a) => a.code));
      for (const rule of enemy.aiRules) {
        expect(
          actionCodes.has(rule.actionCode),
          `${enemy.code}: aiRule.actionCode=${rule.actionCode}`,
        ).toBe(true);
      }
    }
  });

  it('敵のaiRules: 各priority群のweight合計>0（docs/19 実装注意8）', () => {
    for (const enemy of ENEMIES) {
      const byPriority = new Map<number, number>();
      for (const rule of enemy.aiRules) {
        byPriority.set(rule.priority, (byPriority.get(rule.priority) ?? 0) + rule.weight);
      }
      for (const [priority, sum] of byPriority) {
        expect(sum, `${enemy.code} priority=${priority}`).toBeGreaterThan(0);
      }
    }
  });

  it('敵のdropTableCode → reward_tables', () => {
    for (const enemy of ENEMIES) {
      expect(enemy.dropTableCode).not.toBeNull();
      expect(
        rewardTableCodes.has(enemy.dropTableCode as string),
        `${enemy.code}.dropTableCode=${enemy.dropTableCode}`,
      ).toBe(true);
    }
  });

  it('敵行動のsummon.enemyCode → enemies', () => {
    for (const enemy of ENEMIES) {
      for (const action of enemy.actions) {
        for (const effect of action.effects) {
          if (effect.effectType === 'summon') {
            expect(enemyCodes.has(effect.params.enemyCode as string)).toBe(true);
          }
        }
      }
    }
  });

  it('upgradesのprerequisiteCode → upgrade_nodes', () => {
    for (const node of UPGRADE_NODES) {
      if (node.prerequisiteCode !== null) {
        expect(upgradeCodes.has(node.prerequisiteCode), `${node.code}`).toBe(true);
      }
    }
  });

  it('実績のキャラ解放報酬 → characters', () => {
    for (const ach of ACHIEVEMENTS) {
      if (ach.reward?.type === 'characterUnlock') {
        expect(characterCodes.has(ach.reward.value), `${ach.code}`).toBe(true);
      }
    }
  });

  it('eventsの各choiceのoutcomes確率合計=100', () => {
    for (const event of RANDOM_EVENTS) {
      for (const choice of event.choices) {
        const sum = choice.outcomes.reduce((acc, o) => acc + o.probability, 0);
        expect(sum, `${event.code} choice#${choice.order}`).toBe(100);
      }
    }
  });

  it('eventsの参照（startBattle.enemyCodes / treasureRoll.tableCode）', () => {
    for (const event of RANDOM_EVENTS) {
      for (const choice of event.choices) {
        for (const outcome of choice.outcomes) {
          for (const effect of outcome.effects) {
            if (effect.type === 'startBattle' && effect.enemyCodes) {
              for (const code of effect.enemyCodes) {
                expect(enemyCodes.has(code), `${event.code}: enemyCode=${code}`).toBe(true);
              }
            }
            if (effect.type === 'treasureRoll') {
              expect(rewardTableCodes.has(effect.tableCode), `${event.code}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('ストーリーのclear条件のdungeonCode → dungeons', () => {
    const dungeonCodes = new Set(DUNGEONS.map((d) => d.code));
    for (const story of STORIES) {
      if (story.unlockCondition.type === 'clear') {
        expect(dungeonCodes.has(story.unlockCondition.dungeonCode), story.code).toBe(true);
      }
    }
  });

  it('キャラ初期装備のweaponTypeが得意武器種と一致', () => {
    for (const chara of CHARACTERS) {
      const equip = EQUIPMENT.find((e) => e.code === chara.initialEquipCode);
      expect(equip?.weaponType, chara.code).toBe(chara.favoredWeaponType);
    }
  });
});

describe('(d) 件数', () => {
  it.each([
    ['characters', CHARACTERS.length, 3],
    ['skills', SKILLS.length, 20],
    ['relics', RELICS.length, 10],
    ['equipment', EQUIPMENT.length, 16],
    ['enemies', ENEMIES.length, 8],
    ['events', RANDOM_EVENTS.length, 10],
    ['upgrades', UPGRADE_NODES.length, 12],
    ['achievements', ACHIEVEMENTS.length, 10],
    ['dungeons', DUNGEONS.length, 1],
    ['dungeon_node_types', DUNGEON_NODE_TYPES.length, 13],
    ['reward_tables', REWARD_TABLES.length, 6],
  ])('%s = %i (expected %i)', (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('stories >= 2', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(2);
  });

  it('内訳: 呪いレリック2種 / 武器10・防具3・アクセ3 / エリート2・ボス1', () => {
    expect(RELICS.filter((r) => r.isCursed)).toHaveLength(2);
    expect(EQUIPMENT.filter((e) => e.slot === 'weapon')).toHaveLength(10);
    expect(EQUIPMENT.filter((e) => e.slot === 'armor')).toHaveLength(3);
    expect(EQUIPMENT.filter((e) => e.slot === 'accessory')).toHaveLength(3);
    expect(ENEMIES.filter((e) => e.enemyType === 'elite')).toHaveLength(2);
    expect(ENEMIES.filter((e) => e.enemyType === 'boss')).toHaveLength(1);
    expect(SKILLS.filter((s) => s.isInnate)).toHaveLength(3);
  });
});

describe('(e) effect paramsがeffect-params.tsのスキーマをパス', () => {
  it('skills: Lv1 params + levelScaling適用後の各レベルのparams', () => {
    for (const skill of SKILLS) {
      for (const effect of skill.effects) {
        expect(
          effectParamsSchema(effect.effectType).safeParse(effect.params).success,
          `${skill.code}#${effect.order} Lv1`,
        ).toBe(true);
        const byLevel = effect.levelScaling?.byLevel;
        if (byLevel) {
          let merged: Record<string, unknown> = effect.params;
          for (let level = 2; level <= skill.maxLevel; level++) {
            const patch = byLevel[String(level)];
            if (patch) merged = deepMerge(merged, patch);
            expect(
              effectParamsSchema(effect.effectType).safeParse(merged).success,
              `${skill.code}#${effect.order} Lv${level}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('skills: lifesteal行は直前にdamage行がある（docs/18 実装注意5）', () => {
    for (const skill of SKILLS) {
      const sorted = [...skill.effects].sort((a, b) => a.order - b.order);
      sorted.forEach((effect, i) => {
        if (effect.effectType === 'lifesteal') {
          expect(sorted[i - 1]?.effectType, skill.code).toBe('damage');
        }
      });
    }
  });

  it('equipment: passiveEffectの各行', () => {
    for (const equip of EQUIPMENT) {
      for (const effect of equip.passiveEffect ?? []) {
        expect(
          effectParamsSchema(effect.effectType).safeParse(effect.params).success,
          `${equip.code}: ${effect.effectType}`,
        ).toBe(true);
      }
    }
  });

  it('enemies: 行動effectsの各params（summon/guard含む）', () => {
    for (const enemy of ENEMIES) {
      for (const action of enemy.actions) {
        for (const effect of action.effects) {
          const schema =
            effect.effectType === 'summon'
              ? summonParamsSchema
              : effect.effectType === 'guard'
                ? guardParamsSchema
                : effectParamsSchema(effect.effectType);
          expect(
            schema.safeParse(effect.params).success,
            `${enemy.code}.${action.code}: ${effect.effectType}`,
          ).toBe(true);
        }
      }
    }
  });

  it('relics: effect内のeffect_type名キー（heal/stat_passive/sp_gain等）のparams', () => {
    const effectTypeKeys = new Set<string>(EFFECT_TYPES);
    let validated = 0;
    for (const relic of RELICS) {
      for (const [key, value] of Object.entries(relic.effect)) {
        if (effectTypeKeys.has(key)) {
          expect(
            effectParamsSchema(key).safeParse(value).success,
            `${relic.code}: effect.${key}`,
          ).toBe(true);
          validated += 1;
        }
      }
    }
    // eagle_eye / iron_heart / berserker_mask / last_stand の stat_passive、
    // explorer_compass / healing_herb / soul_eater の heal・sp_gain が対象
    expect(validated).toBeGreaterThanOrEqual(7);
  });
});
