// マスタデータ行のZodスキーマ + TS型
// prisma/schema.prisma のマスタモデルのフィールド（id/createdAt/updatedAt除く）と対応する。
// ネスト構造: SkillMasterはeffects[]、EnemyMasterはactions[]/aiRules[]、
// RandomEventMasterはchoices[]、DungeonMasterはdifficulties[]を内包し、seedで子テーブルへ展開する。
import { z } from 'zod';

import {
  EFFECT_TYPES,
  ELEMENTS,
  effectParamsSchema,
  effectTypeSchema,
  elementSchema,
  statusCodeSchema,
} from '@/domain/skill/effect-params';

// ---------------------------------------------------------------
// 共通
// ---------------------------------------------------------------

export const RARITIES = ['common', 'rare', 'epic'] as const;
export const raritySchema = z.enum(RARITIES);
export type Rarity = (typeof RARITIES)[number];

const codeSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/, 'codeは英小文字スネークケース');

// 戦闘ステータス（characters/enemiesのbase_stats。docs/CORE_SPEC §5.1）
export const combatStatsSchema = z.object({
  maxHp: z.number().int().min(1),
  atk: z.number().int().min(0),
  def: z.number().int().min(0),
  spd: z.number().int().min(0),
  critRate: z.number().min(0).max(100),
  critDmg: z.number().min(0),
  eva: z.number().min(0).max(100),
  acc: z.number().min(-100).max(100),
  statusRes: z.number().min(0).max(100),
  maxSp: z.number().int().min(0).optional(), // プレイヤーのみ（共通10。docs/05 §1.1）
  elemRes: z.partialRecord(elementSchema, z.number()).optional(), // 敵のみ（MVPは全敵なし）
  // ボス専用: 怒り状態（docs/19 §6.3）。hp/maxHp <= hpBelow で恒久atk+atkUpPct%（解除不能・バフ枠外）。
  // enemiesテーブルに専用列がないため base_stats JSONB 内に保持する（追加は非破壊）
  enrage: z.object({ hpBelow: z.number().min(0).max(1), atkUpPct: z.number().min(0) }).optional(),
});
export type CombatStats = z.infer<typeof combatStatsSchema>;

// level_scaling（docs/18 §2.5）: byLevel = レベル別のparams差分、unlockAtLevel = 効果行の解禁レベル
export const levelScalingSchema = z
  .object({
    byLevel: z.record(z.string().regex(/^[2-9]$/), z.record(z.string(), z.unknown())).optional(),
    unlockAtLevel: z.number().int().min(2).optional(),
  })
  .refine((v) => v.byLevel !== undefined || v.unlockAtLevel !== undefined, {
    message: 'levelScalingはbyLevelかunlockAtLevelのいずれかを持つこと',
  });
export type LevelScaling = z.infer<typeof levelScalingSchema>;

// ---------------------------------------------------------------
// Skill（skills + skill_effects）
// ---------------------------------------------------------------

// skills.skill_type はDB CHECK制約で active/passive のみ（migration SQL / DEC-240）。
// docs/18 §3.1のUI分類（heal/buff/debuff等）はSPを消費するものを全てactiveへ正規化する。
export const SKILL_TYPES = ['active', 'passive'] as const;
export const skillTypeSchema = z.enum(SKILL_TYPES);

// target_typeはschema.prismaコメントの値域（enemy_single/enemy_all/self）を採用
// （docs/18 §2.2の enemy/all_enemies と表記が異なる。値の対応: enemy→enemy_single, all_enemies→enemy_all）
export const TARGET_TYPES = ['enemy_single', 'enemy_all', 'self'] as const;
export const targetTypeSchema = z.enum(TARGET_TYPES);

export const skillEffectDefSchema = z
  .object({
    order: z.number().int().min(1),
    effectType: effectTypeSchema,
    params: z.record(z.string(), z.unknown()), // Lv1時点の値
    levelScaling: levelScalingSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const result = effectParamsSchema(v.effectType).safeParse(v.params);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: `params invalid for effect_type=${v.effectType}: ${result.error.message}`,
        path: ['params'],
      });
    }
  });
export type SkillEffectDef = z.infer<typeof skillEffectDefSchema>;

export const skillMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  skillType: skillTypeSchema,
  rarity: raritySchema,
  spCost: z.number().int().min(0),
  targetType: targetTypeSchema,
  element: elementSchema,
  maxLevel: z.number().int().min(1).max(3),
  characterCode: z.string().nullable(), // 固有・キャラ専用スキルのみ
  isInnate: z.boolean(),
  sortOrder: z.number().int(),
  effects: z.array(skillEffectDefSchema).min(1).max(3),
});
export type SkillMaster = z.infer<typeof skillMasterSchema>;

// ---------------------------------------------------------------
// Character
// ---------------------------------------------------------------

export const characterUnlockConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('initial') }),
  z.object({ type: z.literal('shards'), amount: z.number().int().min(1) }),
  z.object({ type: z.literal('achievement'), achievementCode: codeSchema }),
]);
export type CharacterUnlockCondition = z.infer<typeof characterUnlockConditionSchema>;

// 得意武器種はdocs/18 §6.1のweapon_kind（sword/rod/dagger/hammer）に合わせる
export const WEAPON_TYPES = ['sword', 'rod', 'dagger', 'hammer'] as const;
export const weaponTypeSchema = z.enum(WEAPON_TYPES);

export const characterMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  element: elementSchema,
  baseStats: combatStatsSchema,
  growthRates: z.object({
    maxHp: z.number().min(0.8).max(1.2),
    atk: z.number().min(0.8).max(1.2),
    def: z.number().min(0.8).max(1.2),
    spd: z.number().min(0.8).max(1.2),
  }),
  favoredWeaponType: weaponTypeSchema,
  innateSkillCode: codeSchema,
  initialSkillCodes: z.array(codeSchema).min(1),
  initialEquipCode: z.string().nullable(),
  unlockCondition: characterUnlockConditionSchema,
  sortOrder: z.number().int(),
});
export type CharacterMaster = z.infer<typeof characterMasterSchema>;

// ---------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------

export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'] as const;
export const equipmentSlotSchema = z.enum(EQUIPMENT_SLOTS);

// base_statsは加算値の部分集合（docs/18 §6.1。hpはmaxHpとして保持）
export const equipmentBaseStatsSchema = z.partialRecord(
  z.enum(['atk', 'def', 'maxHp', 'spd', 'critRate', 'critDmg', 'eva']),
  z.number(),
);

// 装備パッシブ効果行: skill_effectsと同一paramsスキーマ + 発火タイミング。
// elementConditionはtide_staff「水属性与ダメのみ+10%」の条件表現（docs/18 ISSUE-185のelementConditionキー）
export const equipmentPassiveEffectDefSchema = z
  .object({
    effectType: effectTypeSchema,
    params: z.record(z.string(), z.unknown()),
    trigger: z.enum(['always', 'battle_start', 'on_attack']),
    elementCondition: elementSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const result = effectParamsSchema(v.effectType).safeParse(v.params);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: `params invalid for effect_type=${v.effectType}: ${result.error.message}`,
        path: ['params'],
      });
    }
  });
export type EquipmentPassiveEffectDef = z.infer<typeof equipmentPassiveEffectDefSchema>;

export const equipmentMasterSchema = z
  .object({
    code: codeSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    slot: equipmentSlotSchema,
    weaponType: weaponTypeSchema.nullable(), // weaponのみ非null
    rarity: raritySchema,
    baseStats: equipmentBaseStatsSchema,
    passiveEffect: z.array(equipmentPassiveEffectDefSchema).min(1).nullable(),
    basePrice: z.number().int().min(0),
    isStarter: z.boolean(),
    sortOrder: z.number().int(),
  })
  .refine((v) => (v.slot === 'weapon') === (v.weaponType !== null), {
    message: 'weaponTypeは武器のみ必須・武器以外はnull',
  });
export type EquipmentMaster = z.infer<typeof equipmentMasterSchema>;

// ---------------------------------------------------------------
// Relic
// ---------------------------------------------------------------

export const RELIC_TRIGGERS = [
  'always',
  'battle_start',
  'turn_start',
  'turn_end',
  'on_low_hp',
  'on_kill',
  'node_enter',
] as const;
export const relicTriggerSchema = z.enum(RELIC_TRIGGERS);

export const SYNERGY_TAGS = [
  'poison',
  'crit',
  'defense',
  'gold',
  'sustain',
  'tempo',
  'exploration',
] as const;
export const synergyTagSchema = z.enum(SYNERGY_TAGS);

// レリックeffectはskill_effects paramsスキーマ+レリック専用キーの複合（docs/18 §7.3の表記を保持）
export const relicEffectSchema = z.record(z.string(), z.unknown());

export const relicMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  rarity: raritySchema,
  trigger: relicTriggerSchema,
  effect: relicEffectSchema,
  isCursed: z.boolean(),
  synergyTags: z.array(synergyTagSchema),
  sortOrder: z.number().int(),
});
export type RelicMaster = z.infer<typeof relicMasterSchema>;

// ---------------------------------------------------------------
// Enemy（enemies + enemy_actions + enemy_ai_rules）
// ---------------------------------------------------------------

export const ENEMY_TYPES = ['normal', 'strong', 'elite', 'boss'] as const;
export const enemyTypeSchema = z.enum(ENEMY_TYPES);

// 敵行動はskill_effectsと同一ハンドラを共用するが、summon/guardの2種が追加で必要（docs/19 §1.2）
export const ENEMY_EFFECT_TYPES = [...EFFECT_TYPES, 'summon', 'guard'] as const;
export const enemyEffectTypeSchema = z.enum(ENEMY_EFFECT_TYPES);

export const summonParamsSchema = z.object({
  enemyCode: codeSchema,
  count: z.number().int().min(1),
});
export const guardParamsSchema = z.object({
  damageCutPct: z.number().min(0).max(100), // 防御コマンドと同処理（docs/19 DEC-054）
});

export const enemyActionEffectDefSchema = z
  .object({
    effectType: enemyEffectTypeSchema,
    // 13種の基本paramsに敵専用の拡張キーを許容する:
    //   buff.target('self'|'allyAll') / debuff.chancePct / heal.target / counter.maxPerTurn（docs/19 §5）
    params: z.record(z.string(), z.unknown()),
  })
  .superRefine((v, ctx) => {
    const schema =
      v.effectType === 'summon'
        ? summonParamsSchema
        : v.effectType === 'guard'
          ? guardParamsSchema
          : effectParamsSchema(v.effectType);
    const result = schema.safeParse(v.params);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: `params invalid for effect_type=${v.effectType}: ${result.error.message}`,
        path: ['params'],
      });
    }
  });
export type EnemyActionEffectDef = z.infer<typeof enemyActionEffectDefSchema>;

// intentアイコンは16章§7.1のcategoryと1:1対応（guard系はISSUE-113によりshieldで暫定）
export const INTENT_ICONS = [
  'attack',
  'strong_attack',
  'buff',
  'debuff',
  'heal',
  'summon',
  'shield',
  'unknown',
] as const;
export const intentIconSchema = z.enum(INTENT_ICONS);

export const enemyActionDefSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  effects: z.array(enemyActionEffectDefSchema).min(1),
  intentIcon: intentIconSchema,
  intentLabel: z.string().min(1),
});
export type EnemyActionDef = z.infer<typeof enemyActionDefSchema>;

// 条件DSL（docs/19 §2.2。複数キーはAND）
export const aiConditionSchema = z
  .object({
    hpBelow: z.number().min(0).max(1).optional(),
    hpAbove: z.number().min(0).max(1).optional(),
    playerHpBelow: z.number().min(0).max(1).optional(),
    turnMod: z.object({ n: z.number().int().min(1), eq: z.number().int().min(0) }).optional(),
    selfBuffMissing: z.string().optional(),
    allyBuffMissing: z.string().optional(),
    targetStatusMissing: statusCodeSchema.optional(),
    allyCount: z
      .object({ lt: z.number().int().optional(), gte: z.number().int().optional() })
      .optional(),
    phaseShiftPending: z.boolean().optional(),
    turnsInPhaseMod: z
      .object({ n: z.number().int().min(1), eq: z.number().int().min(0) })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '条件は1キー以上（無条件はnullで表現）' });
export type AiCondition = z.infer<typeof aiConditionSchema>;

export const enemyAiRuleDefSchema = z.object({
  priority: z.number().int().min(1), // 基本重みテーブル行はpriority=100・conditions=null（docs/19 §1.3）
  bossPhase: z.number().int().min(1).max(3).nullable(), // ボスのみ。フェーズ注記（判定自体はconditionsのhpBelowが正）
  conditions: aiConditionSchema.nullable(),
  actionCode: codeSchema,
  weight: z.number().int().min(1),
});
export type EnemyAiRuleDef = z.infer<typeof enemyAiRuleDefSchema>;

export const enemyMasterSchema = z
  .object({
    code: codeSchema,
    name: z.string().min(1),
    enemyType: enemyTypeSchema,
    element: elementSchema,
    baseStats: combatStatsSchema,
    baseExp: z.number().int().min(0),
    baseGold: z.number().int().min(0),
    dropTableCode: z.string().nullable(),
    appearFloorMin: z.number().int().min(1).max(10),
    appearFloorMax: z.number().int().min(1).max(10),
    isSummon: z.boolean(), // true=召喚でのみ出現
    sortOrder: z.number().int(),
    actions: z.array(enemyActionDefSchema).min(1),
    aiRules: z.array(enemyAiRuleDefSchema).min(1),
  })
  .refine((v) => v.appearFloorMin <= v.appearFloorMax, {
    message: 'appearFloorMin <= appearFloorMax',
  })
  .refine((v) => v.aiRules.some((r) => r.conditions === null), {
    message: '基本重みテーブル行（conditions=null）が1行以上必要（docs/19 実装注意8）',
  });
export type EnemyMaster = z.infer<typeof enemyMasterSchema>;

// ---------------------------------------------------------------
// Dungeon（dungeons + dungeon_difficulties + dungeon_node_types）
// ---------------------------------------------------------------

export const NODE_TYPE_CODES = [
  'BATTLE',
  'STRONG',
  'ELITE',
  'BOSS',
  'TREASURE',
  'SHOP',
  'REST',
  'EVENT',
  'BLESS',
  'HEAL',
  'CURSE',
  'STORY',
  'SECRET',
] as const;
export const nodeTypeCodeSchema = z.enum(NODE_TYPE_CODES);
export type NodeTypeCode = (typeof NODE_TYPE_CODES)[number];

const nodeTypeWeightsSchema = z.partialRecord(nodeTypeCodeSchema, z.number().int().min(0));

// generation_config（docs/17 §3.1〜§3.4をJSONで保持）
export const generationConfigSchema = z.object({
  floorCount: z.number().int().min(1),
  nodeCounts: z.object({
    firstFloor: z.number().int().min(1),
    lastFloor: z.number().int().min(1),
    middleMin: z.number().int().min(1),
    middleMax: z.number().int().min(1),
  }),
  edgesPerNode: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  fixedNodes: z.object({
    firstFloorType: nodeTypeCodeSchema,
    lastFloorType: nodeTypeCodeSchema,
  }),
  typeWeightsByFloorBand: z
    .array(
      z.object({
        floorMin: z.number().int().min(1),
        floorMax: z.number().int().min(1),
        weights: nodeTypeWeightsSchema,
      }),
    )
    .min(1),
  weightReassign: z.object({
    eliteBelowMinFloorTo: nodeTypeCodeSchema, // 階層1〜2のELITE重みの振替先
    curseBelowMinFloorTo: nodeTypeCodeSchema, // 階層2のCURSE重みの振替先
  }),
  constraints: z.object({
    restGuaranteedFloors: z.array(z.number().int().min(1)),
    shopCountMin: z.number().int().min(0),
    shopCountMax: z.number().int().min(0),
    shopFloorMin: z.number().int().min(1),
    shopFloorMax: z.number().int().min(1),
    eliteMinFloor: z.number().int().min(1),
    curseMinFloor: z.number().int().min(1),
    noSameTypeTripleOnPath: z.boolean(),
    secret: z.object({
      chance: z.number().min(0).max(1),
      floorMin: z.number().int().min(1),
      floorMax: z.number().int().min(1),
      maxCount: z.number().int().min(0),
    }),
  }),
});
export type GenerationConfig = z.infer<typeof generationConfigSchema>;

export const dungeonDifficultyDefSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  statMod: z.number().min(0),
  expMod: z.number().min(0),
  rewardMod: z.number().min(0),
  unlockCondition: z.record(z.string(), z.unknown()).nullable(),
});
export type DungeonDifficultyDef = z.infer<typeof dungeonDifficultyDefSchema>;

export const dungeonMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  floors: z.number().int().min(1),
  generationConfig: generationConfigSchema,
  sortOrder: z.number().int(),
  difficulties: z.array(dungeonDifficultyDefSchema).min(1),
});
export type DungeonMaster = z.infer<typeof dungeonMasterSchema>;

export const dungeonNodeTypeMasterSchema = z.object({
  code: nodeTypeCodeSchema,
  name: z.string().min(1),
  iconKey: z.string().min(1),
  description: z.string().min(1),
});
export type DungeonNodeTypeMaster = z.infer<typeof dungeonNodeTypeMasterSchema>;

// ---------------------------------------------------------------
// RandomEvent（random_events + random_event_choices）
// ---------------------------------------------------------------

// イベント結果effect（docs/17 §6.1の結果を宣言的に表現。適用はserver/domain側）
export const eventEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('runStatModPct'),
    stat: z.enum(['atk', 'def', 'maxHp']),
    valuePct: z.number(),
  }), // ラン中永続（±）
  z.object({ type: z.literal('damageHpPct'), pct: z.number().min(0).max(100) }), // maxHp基準%・floor・HP下限1
  z.object({ type: z.literal('loseHpCurrentPct'), pct: z.number().min(0).max(100) }), // 現HP基準%
  z.object({ type: z.literal('healHpPct'), pct: z.number().min(0).max(100) }), // maxHp基準%回復
  z.object({ type: z.literal('gold'), amount: z.number().int() }), // ±（負=支払い/喪失）
  z.object({ type: z.literal('goldPctLoss'), pct: z.number().min(0).max(100) }), // 所持ゴールドの%喪失（floor）
  z.object({ type: z.literal('grantRelic') }), // 未所持レリックからランダム1個
  z.object({
    type: z.literal('grantEquipment'),
    rarityWeights: z.partialRecord(raritySchema, z.number().int().min(0)),
  }),
  z.object({
    type: z.literal('grantConsumable'),
    itemCode: z.enum(['potion', 'hi_potion', 'antidote']),
    count: z.number().int().min(1),
  }),
  z.object({ type: z.literal('grantExpPerFloor'), amountPerFloor: z.number().int().min(1) }), // EXP+（amount×階層）
  z.object({ type: z.literal('upgradeRandomSkill') }), // 所持スキル1つ強化Lv+1（最大3）
  z.object({
    type: z.literal('startBattle'),
    encounter: z.enum(['random_battle', 'fixed']),
    enemyCodes: z.array(codeSchema).optional(), // fixedのみ
    bonusGold: z.number().int().min(0).optional(), // 勝利時ボーナス
  }),
  z.object({ type: z.literal('treasureRoll'), tableCode: codeSchema }), // 宝箱抽選をtableCodeで1回
  z.object({
    type: z.literal('consumeItemOrHpPct'), // アイテム消費、未所持なら現HP%消費（EV-06）
    itemCode: z.enum(['potion', 'hi_potion', 'antidote']),
    fallbackHpCurrentPct: z.number().min(0).max(100),
  }),
  z.object({ type: z.literal('weakenNextBattle') }), // 次戦闘開始時に自分へweaken（EV-05呪い）
]);
export type EventEffect = z.infer<typeof eventEffectSchema>;

export const eventOutcomeSchema = z.object({
  probability: z.number().int().min(1).max(100),
  resultText: z.string().min(1),
  effects: z.array(eventEffectSchema),
});
export type EventOutcome = z.infer<typeof eventOutcomeSchema>;

export const eventChoiceDefSchema = z.object({
  order: z.number().int().min(1),
  label: z.string().min(1),
  outcomes: z.array(eventOutcomeSchema).min(1),
});
export type EventChoiceDef = z.infer<typeof eventChoiceDefSchema>;

export const randomEventMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  flavorText: z.string().min(1),
  nodeType: nodeTypeCodeSchema,
  weight: z.number().int().min(1),
  minFloor: z.number().int().min(1).max(10),
  maxFloor: z.number().int().min(1).max(10),
  sortOrder: z.number().int(),
  choices: z.array(eventChoiceDefSchema).min(2).max(3),
});
export type RandomEventMaster = z.infer<typeof randomEventMasterSchema>;

// ---------------------------------------------------------------
// RewardTable
// ---------------------------------------------------------------

export const REWARD_TYPES = ['equipment', 'gold', 'consumable', 'relic'] as const;
export const rewardTypeSchema = z.enum(REWARD_TYPES);

export const rewardEntrySchema = z.object({
  weight: z.number().int().min(0),
  rewardType: rewardTypeSchema,
  params: z.record(z.string(), z.unknown()),
  guaranteed: z.boolean().optional(), // true=重み抽選と別に確定付与（rt_boss/rt_treasure_secretの固定分）
  chancePct: z.number().min(0).max(100).optional(), // guaranteed系の追加抽選率（rt_bossのepic 50%）
});
export type RewardEntry = z.infer<typeof rewardEntrySchema>;

export const rewardTableMasterSchema = z.object({
  code: codeSchema,
  description: z.string().min(1),
  entries: z.array(rewardEntrySchema).min(1),
});
export type RewardTableMaster = z.infer<typeof rewardTableMasterSchema>;

// ---------------------------------------------------------------
// UpgradeNode
// ---------------------------------------------------------------

export const UPGRADE_EFFECT_TYPES = [
  'startHpPct',
  'startAtkPct',
  'startGold',
  'startRelic',
  'rerollPlus',
  'shardGainPct',
] as const;
export const upgradeEffectTypeSchema = z.enum(UPGRADE_EFFECT_TYPES);

export const upgradeNodeMasterSchema = z
  .object({
    code: codeSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    effect: z.object({ type: upgradeEffectTypeSchema, valuePerRank: z.number() }),
    maxRank: z.number().int().min(1),
    costPerRank: z.array(z.number().int().min(1)).min(1),
    prerequisiteCode: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .refine((v) => v.costPerRank.length === v.maxRank, {
    message: 'costPerRankの要素数はmaxRankと一致すること',
  });
export type UpgradeNodeMaster = z.infer<typeof upgradeNodeMasterSchema>;

// ---------------------------------------------------------------
// Achievement
// ---------------------------------------------------------------

export const achievementConditionSchema = z.object({
  type: z.enum([
    'totalRuns',
    'totalClears',
    'totalDefeats',
    'totalKills',
    'eliteKills',
    'runLevel',
    'runRelicsHeld',
    'runGoldHeld',
    'codexRatePct',
    'bestFloor',
  ]),
  value: z.number().int().min(1),
});

export const achievementRewardSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shards'),
    value: z.number().int().min(1),
    title: z.string().optional(),
  }),
  z.object({ type: z.literal('characterUnlock'), value: codeSchema }),
]);

export const achievementMasterSchema = z.object({
  code: codeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  condition: achievementConditionSchema,
  reward: achievementRewardSchema.nullable(),
  sortOrder: z.number().int(),
});
export type AchievementMaster = z.infer<typeof achievementMasterSchema>;

// ---------------------------------------------------------------
// Story
// ---------------------------------------------------------------

export const storyUnlockConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('initial') }),
  z.object({ type: z.literal('storyNode') }), // STORYノード到達で断章解放
  z.object({ type: z.literal('clear'), dungeonCode: codeSchema }),
]);

export const storyMasterSchema = z.object({
  code: codeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  unlockCondition: storyUnlockConditionSchema,
  sortOrder: z.number().int(),
});
export type StoryMaster = z.infer<typeof storyMasterSchema>;

export { EFFECT_TYPES, ELEMENTS };
