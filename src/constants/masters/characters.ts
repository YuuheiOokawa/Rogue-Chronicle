// キャラクターマスタ 3体（docs/05_Game_Design.md §1.1 完全転記）
// 初期スキル・初期装備のcodeは docs/18_Skill_Design.md を正とする（優先順 18 > 05）
import type { CharacterMaster } from './types';

export const CHARACTERS: CharacterMaster[] = [
  {
    code: 'swordsman_rain',
    name: 'レイン',
    description:
      '忘却の遺跡の入口の村に流れ着いた記憶喪失の剣士。自分が何者かを知る手がかりが遺跡の年代記に眠ると信じ、何度倒れても剣を取る。「倒れた回数だけ、強くなれる」',
    element: 'fire',
    baseStats: {
      maxHp: 100,
      atk: 12,
      def: 10,
      spd: 10,
      critRate: 5,
      critDmg: 150,
      eva: 5,
      acc: 0,
      statusRes: 0,
      maxSp: 10,
    },
    growthRates: { maxHp: 1.1, atk: 1.0, def: 1.1, spd: 0.9 },
    favoredWeaponType: 'sword',
    innateSkillCode: 'skill_indomitable',
    initialSkillCodes: ['skill_flame_slash'],
    initialEquipCode: 'iron_sword',
    unlockCondition: { type: 'initial' },
    sortOrder: 1,
  },
  {
    code: 'mage_lilia',
    name: 'リリア',
    description:
      '遺跡を「巨大な書物」とみなし解読を試みる若き魔導士。魔力の流れを循環させる独自の呼吸法で、他者より多くの術式を紡げる。「この遺跡は、読まれたがっている」',
    element: 'water',
    baseStats: {
      maxHp: 80,
      atk: 14,
      def: 7,
      spd: 9,
      critRate: 5,
      critDmg: 150,
      eva: 5,
      acc: 0,
      statusRes: 0,
      maxSp: 10,
    },
    growthRates: { maxHp: 0.9, atk: 1.2, def: 0.8, spd: 1.0 },
    favoredWeaponType: 'rod',
    innateSkillCode: 'skill_mana_cycle',
    initialSkillCodes: ['skill_aqua_bolt'],
    initialEquipCode: 'oak_rod',
    unlockCondition: { type: 'shards', amount: 300 },
    sortOrder: 2,
  },
  {
    code: 'rogue_gald',
    name: 'ガルド',
    description:
      '遺跡の財宝を狙う皮肉屋の盗賊。だが持ち出した財宝はなぜか翌朝すべて遺跡に戻っている。「なら全部見て回るまでさ——最速でな」',
    element: 'wind',
    baseStats: {
      maxHp: 85,
      atk: 11,
      def: 8,
      spd: 14,
      critRate: 15,
      critDmg: 150,
      eva: 10,
      acc: 0,
      statusRes: 0,
      maxSp: 10,
    },
    growthRates: { maxHp: 0.95, atk: 1.05, def: 0.9, spd: 1.2 },
    favoredWeaponType: 'dagger',
    innateSkillCode: 'skill_first_strike',
    initialSkillCodes: ['skill_gale_slash'],
    initialEquipCode: 'bronze_dagger',
    unlockCondition: { type: 'achievement', achievementCode: 'ach_runs_10' },
    sortOrder: 3,
  },
];

// --- docs間の差異と採用判断（優先順: 19 > 18 > 17 > 05） ---
// - リリア初期装備: docs/05は `apprentice_rod`（仮決定・17/18で確定と注記）→ docs/18 §6.2の `oak_rod` を採用
// - ガルド初期スキル: docs/05は `skill_gale_edge` → docs/18 §3.1の `skill_gale_slash` を採用
// - 得意武器種の表記: docs/05「杖」→ docs/18 §6.1のweapon_kind（rod）に正規化
