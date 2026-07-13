// マスタデータ冪等シード（`pnpm db:seed` = `tsx prisma/seed.ts`）
// - マスタ行はcodeでupsert（再実行しても件数不変）
// - ネスト（skill_effects / enemy_actions / enemy_ai_rules / dungeon_difficulties /
//   random_event_choices）は親確定後に deleteMany → create で全置換
// - 投入前に全データをZodスキーマで検証し、不正なマスタはシードを失敗させる（docs/18 実装注意3）
import { Prisma, PrismaClient } from '@prisma/client';

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
  randomEventMasterSchema,
  relicMasterSchema,
  rewardTableMasterSchema,
  skillMasterSchema,
  storyMasterSchema,
  upgradeNodeMasterSchema,
} from '../src/constants/masters';

const prisma = new PrismaClient();

// Zodの検証済みオブジェクトをPrismaのJson入力へ渡すためのヘルパ
const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const toJsonOrDbNull = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  value === null || value === undefined ? Prisma.DbNull : toJson(value);

function validateAll(): void {
  for (const row of CHARACTERS) characterMasterSchema.parse(row);
  for (const row of SKILLS) skillMasterSchema.parse(row);
  for (const row of EQUIPMENT) equipmentMasterSchema.parse(row);
  for (const row of RELICS) relicMasterSchema.parse(row);
  for (const row of ENEMIES) enemyMasterSchema.parse(row);
  for (const row of DUNGEONS) dungeonMasterSchema.parse(row);
  for (const row of DUNGEON_NODE_TYPES) dungeonNodeTypeMasterSchema.parse(row);
  for (const row of RANDOM_EVENTS) randomEventMasterSchema.parse(row);
  for (const row of REWARD_TABLES) rewardTableMasterSchema.parse(row);
  for (const row of UPGRADE_NODES) upgradeNodeMasterSchema.parse(row);
  for (const row of ACHIEVEMENTS) achievementMasterSchema.parse(row);
  for (const row of STORIES) storyMasterSchema.parse(row);
}

async function seedCharacters(): Promise<void> {
  for (const row of CHARACTERS) {
    const data = {
      name: row.name,
      description: row.description,
      element: row.element,
      baseStats: toJson(row.baseStats),
      growthRates: toJson(row.growthRates),
      favoredWeaponType: row.favoredWeaponType,
      innateSkillCode: row.innateSkillCode,
      initialSkillCodes: toJson(row.initialSkillCodes),
      initialEquipCode: row.initialEquipCode,
      unlockCondition: toJson(row.unlockCondition),
      sortOrder: row.sortOrder,
    };
    await prisma.character.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedEquipment(): Promise<void> {
  for (const row of EQUIPMENT) {
    const data = {
      name: row.name,
      description: row.description,
      slot: row.slot,
      weaponType: row.weaponType,
      rarity: row.rarity,
      baseStats: toJson(row.baseStats),
      passiveEffect: toJsonOrDbNull(row.passiveEffect),
      basePrice: row.basePrice,
      isStarter: row.isStarter,
      sortOrder: row.sortOrder,
    };
    await prisma.equipment.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedSkills(): Promise<void> {
  for (const row of SKILLS) {
    const data = {
      name: row.name,
      description: row.description,
      skillType: row.skillType,
      rarity: row.rarity,
      spCost: row.spCost,
      targetType: row.targetType,
      element: row.element,
      maxLevel: row.maxLevel,
      characterCode: row.characterCode,
      isInnate: row.isInnate,
      sortOrder: row.sortOrder,
    };
    const skill = await prisma.skill.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
    await prisma.skillEffect.deleteMany({ where: { skillId: skill.id } });
    await prisma.skillEffect.createMany({
      data: row.effects.map((effect) => ({
        skillId: skill.id,
        order: effect.order,
        effectType: effect.effectType,
        params: toJson(effect.params),
        levelScaling: toJsonOrDbNull(effect.levelScaling),
      })),
    });
  }
}

async function seedRelics(): Promise<void> {
  for (const row of RELICS) {
    const data = {
      name: row.name,
      description: row.description,
      rarity: row.rarity,
      trigger: row.trigger,
      effect: toJson(row.effect),
      isCursed: row.isCursed,
      synergyTags: toJson(row.synergyTags),
      sortOrder: row.sortOrder,
    };
    await prisma.relic.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedEnemies(): Promise<void> {
  for (const row of ENEMIES) {
    const data = {
      name: row.name,
      enemyType: row.enemyType,
      element: row.element,
      baseStats: toJson(row.baseStats),
      baseExp: row.baseExp,
      baseGold: row.baseGold,
      dropTableCode: row.dropTableCode,
      appearFloorMin: row.appearFloorMin,
      appearFloorMax: row.appearFloorMax,
      isSummon: row.isSummon,
      sortOrder: row.sortOrder,
    };
    const enemy = await prisma.enemy.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
    await prisma.enemyAction.deleteMany({ where: { enemyId: enemy.id } });
    await prisma.enemyAction.createMany({
      data: row.actions.map((action) => ({
        enemyId: enemy.id,
        code: action.code,
        name: action.name,
        effects: toJson(action.effects),
        intentIcon: action.intentIcon,
        intentLabel: action.intentLabel,
      })),
    });
    await prisma.enemyAiRule.deleteMany({ where: { enemyId: enemy.id } });
    await prisma.enemyAiRule.createMany({
      data: row.aiRules.map((rule) => ({
        enemyId: enemy.id,
        priority: rule.priority,
        bossPhase: rule.bossPhase,
        conditions: toJsonOrDbNull(rule.conditions),
        actionCode: rule.actionCode,
        weight: rule.weight,
      })),
    });
  }
}

async function seedDungeons(): Promise<void> {
  for (const row of DUNGEONS) {
    const data = {
      name: row.name,
      description: row.description,
      floors: row.floors,
      generationConfig: toJson(row.generationConfig),
      sortOrder: row.sortOrder,
    };
    const dungeon = await prisma.dungeon.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
    await prisma.dungeonDifficulty.deleteMany({ where: { dungeonId: dungeon.id } });
    await prisma.dungeonDifficulty.createMany({
      data: row.difficulties.map((difficulty) => ({
        dungeonId: dungeon.id,
        code: difficulty.code,
        name: difficulty.name,
        statMod: difficulty.statMod,
        expMod: difficulty.expMod,
        rewardMod: difficulty.rewardMod,
        unlockCondition: toJsonOrDbNull(difficulty.unlockCondition),
      })),
    });
  }
}

async function seedDungeonNodeTypes(): Promise<void> {
  for (const row of DUNGEON_NODE_TYPES) {
    const data = { name: row.name, iconKey: row.iconKey, description: row.description };
    await prisma.dungeonNodeType.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedRandomEvents(): Promise<void> {
  for (const row of RANDOM_EVENTS) {
    const data = {
      name: row.name,
      flavorText: row.flavorText,
      nodeType: row.nodeType,
      weight: row.weight,
      minFloor: row.minFloor,
      maxFloor: row.maxFloor,
      sortOrder: row.sortOrder,
    };
    const event = await prisma.randomEvent.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
    await prisma.randomEventChoice.deleteMany({ where: { eventId: event.id } });
    await prisma.randomEventChoice.createMany({
      data: row.choices.map((choice) => ({
        eventId: event.id,
        order: choice.order,
        label: choice.label,
        outcomes: toJson(choice.outcomes),
      })),
    });
  }
}

async function seedRewardTables(): Promise<void> {
  for (const row of REWARD_TABLES) {
    const data = { description: row.description, entries: toJson(row.entries) };
    await prisma.rewardTable.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedUpgradeNodes(): Promise<void> {
  for (const row of UPGRADE_NODES) {
    const data = {
      name: row.name,
      description: row.description,
      effect: toJson(row.effect),
      maxRank: row.maxRank,
      costPerRank: toJson(row.costPerRank),
      prerequisiteCode: row.prerequisiteCode,
      sortOrder: row.sortOrder,
    };
    await prisma.upgradeNode.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedAchievements(): Promise<void> {
  for (const row of ACHIEVEMENTS) {
    const data = {
      name: row.name,
      description: row.description,
      condition: toJson(row.condition),
      reward: toJsonOrDbNull(row.reward),
      sortOrder: row.sortOrder,
    };
    await prisma.achievement.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedStories(): Promise<void> {
  for (const row of STORIES) {
    const data = {
      title: row.title,
      body: row.body,
      unlockCondition: toJson(row.unlockCondition),
      sortOrder: row.sortOrder,
    };
    await prisma.story.upsert({
      where: { code: row.code },
      create: { code: row.code, ...data },
      update: data,
    });
  }
}

async function seedMasterDataVersion(): Promise<void> {
  const description = 'MVPマスタデータ初期投入（docs/05・17・18・19準拠）';
  await prisma.masterDataVersion.upsert({
    where: { version: MASTER_DATA_VERSION },
    create: { version: MASTER_DATA_VERSION, description },
    update: { description },
  });
}

async function seedAnnouncements(): Promise<void> {
  // announcementsはcode列を持たないため、同一タイトルの存在チェックで冪等化する
  const title = 'Rogue Chronicle 開発版へようこそ';
  const existing = await prisma.announcement.findFirst({ where: { title } });
  if (!existing) {
    await prisma.announcement.create({
      data: {
        title,
        body: '忘却の遺跡（Normal・10階層）が挑戦可能です。不具合・バランスのフィードバックをお待ちしています。',
        category: 'update',
        publishedAt: new Date('2026-07-13T00:00:00Z'),
        expiresAt: null,
      },
    });
  }
}

async function seedMaintenanceSettings(): Promise<void> {
  await prisma.maintenanceSetting.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false, message: null, forcedRetire: false },
    update: {}, // 既存行の運用値（enabled等）はシードで上書きしない
  });
}

async function main(): Promise<void> {
  validateAll();

  await seedCharacters();
  await seedEquipment();
  await seedSkills();
  await seedRelics();
  await seedEnemies();
  await seedDungeons();
  await seedDungeonNodeTypes();
  await seedRandomEvents();
  await seedRewardTables();
  await seedUpgradeNodes();
  await seedAchievements();
  await seedStories();
  await seedMasterDataVersion();
  await seedAnnouncements();
  await seedMaintenanceSettings();

  const counts = {
    characters: await prisma.character.count(),
    equipment: await prisma.equipment.count(),
    skills: await prisma.skill.count(),
    skillEffects: await prisma.skillEffect.count(),
    relics: await prisma.relic.count(),
    enemies: await prisma.enemy.count(),
    enemyActions: await prisma.enemyAction.count(),
    enemyAiRules: await prisma.enemyAiRule.count(),
    dungeons: await prisma.dungeon.count(),
    dungeonDifficulties: await prisma.dungeonDifficulty.count(),
    dungeonNodeTypes: await prisma.dungeonNodeType.count(),
    randomEvents: await prisma.randomEvent.count(),
    randomEventChoices: await prisma.randomEventChoice.count(),
    rewardTables: await prisma.rewardTable.count(),
    upgradeNodes: await prisma.upgradeNode.count(),
    achievements: await prisma.achievement.count(),
    stories: await prisma.story.count(),
    masterDataVersions: await prisma.masterDataVersion.count(),
    announcements: await prisma.announcement.count(),
  };
  console.log(`seed done (master_data_version=${MASTER_DATA_VERSION})`);
  console.table(counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
