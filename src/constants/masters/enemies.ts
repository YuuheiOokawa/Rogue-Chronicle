// 敵マスタ 8種（docs/19_Enemy_AI_Design.md §4〜§6 完全転記）
// - 基礎ステータス: §4（critDmg全敵150 / acc全敵0 / elemRes全敵なし。DEC-050）
// - 行動・AIルール: §5〜§6（数値はDEC-051）。weightは同一priority内で正規化される
// - 基本重みテーブル行は priority=100・conditions=null（docs/19 §1.3）
// - ドロップ: §9.3（rt_battle_normal / rt_battle_elite / rt_boss。発生率はreward-tables.ts参照）
import type { EnemyMaster } from './types';

export const ENEMIES: EnemyMaster[] = [
  // ---- slime（スライム）— 低脅威・回復小技持ち ----
  {
    code: 'slime',
    name: 'スライム',
    enemyType: 'normal',
    element: 'water',
    baseStats: {
      maxHp: 30,
      atk: 8,
      def: 5,
      spd: 6,
      critRate: 5,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 0,
    },
    baseExp: 8,
    baseGold: 10,
    dropTableCode: 'rt_battle_normal',
    appearFloorMin: 1,
    appearFloorMax: 5, // 通常出現1〜5。dark_shamanの召喚でも出現（EXP・G・ドロップ0。DEC-053）
    isSummon: false,
    sortOrder: 1,
    actions: [
      {
        code: 'slime_tackle',
        name: '体当たり',
        effects: [{ effectType: 'damage', params: { mult: 1.0 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'slime_heal',
        name: '自己修復',
        effects: [{ effectType: 'heal', params: { hpPctOfMax: 25, target: 'self' } }],
        intentIcon: 'heal',
        intentLabel: '回復',
      },
    ],
    aiRules: [
      {
        priority: 10,
        bossPhase: null,
        conditions: { hpBelow: 0.5 },
        actionCode: 'slime_heal',
        weight: 70,
      },
      {
        priority: 10,
        bossPhase: null,
        conditions: { hpBelow: 0.5 },
        actionCode: 'slime_tackle',
        weight: 30,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'slime_tackle', weight: 100 },
    ],
  },
  // ---- goblin（ゴブリン）— 標準アタッカー ----
  {
    code: 'goblin',
    name: 'ゴブリン',
    enemyType: 'normal',
    element: 'none',
    baseStats: {
      maxHp: 40,
      atk: 10,
      def: 6,
      spd: 8,
      critRate: 5,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 0,
    },
    baseExp: 10,
    baseGold: 14,
    dropTableCode: 'rt_battle_normal',
    appearFloorMin: 1,
    appearFloorMax: 6,
    isSummon: false,
    sortOrder: 2,
    actions: [
      {
        code: 'goblin_slash',
        name: 'なぎ切り',
        effects: [{ effectType: 'damage', params: { mult: 1.0 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'goblin_smash',
        name: '力任せの一撃',
        effects: [{ effectType: 'damage', params: { mult: 1.5 } }],
        intentIcon: 'strong_attack',
        intentLabel: '強攻撃',
      },
    ],
    aiRules: [
      // とどめ狙い
      {
        priority: 10,
        bossPhase: null,
        conditions: { playerHpBelow: 0.35 },
        actionCode: 'goblin_smash',
        weight: 100,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'goblin_slash', weight: 70 },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'goblin_smash', weight: 30 },
    ],
  },
  // ---- bat（洞窟コウモリ）— 高速・高回避・吸血 ----
  {
    code: 'bat',
    name: '洞窟コウモリ',
    enemyType: 'normal',
    element: 'wind',
    baseStats: {
      maxHp: 28,
      atk: 9,
      def: 4,
      spd: 13,
      critRate: 10, // batのみ10%（docs/19 DEC-050 / ISSUE-114）
      critDmg: 150,
      eva: 15,
      acc: 0,
      statusRes: 0,
    },
    baseExp: 10,
    baseGold: 12,
    dropTableCode: 'rt_battle_normal',
    appearFloorMin: 2,
    appearFloorMax: 7,
    isSummon: false,
    sortOrder: 3,
    actions: [
      {
        code: 'bat_bite',
        name: '噛みつき',
        effects: [{ effectType: 'damage', params: { mult: 0.9 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'bat_drain',
        name: '吸血',
        // drainRatio 1.0 = 与ダメージの100%を自己回復（lifestealハンドラ共用）
        effects: [
          { effectType: 'damage', params: { mult: 0.7 } },
          { effectType: 'lifesteal', params: { ratePct: 100 } },
        ],
        intentIcon: 'heal',
        intentLabel: '吸血',
      },
    ],
    aiRules: [
      {
        priority: 10,
        bossPhase: null,
        conditions: { hpBelow: 0.6 },
        actionCode: 'bat_drain',
        weight: 80,
      },
      {
        priority: 10,
        bossPhase: null,
        conditions: { hpBelow: 0.6 },
        actionCode: 'bat_bite',
        weight: 20,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'bat_bite', weight: 70 },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'bat_drain', weight: 30 },
    ],
  },
  // ---- skeleton（スケルトン）— 高防御・weaken付与・防御時カウンター ----
  {
    code: 'skeleton',
    name: 'スケルトン',
    enemyType: 'normal',
    element: 'none',
    baseStats: {
      maxHp: 45,
      atk: 9,
      def: 12,
      spd: 7,
      critRate: 5,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 20,
    },
    baseExp: 12,
    baseGold: 15,
    dropTableCode: 'rt_battle_normal',
    appearFloorMin: 3,
    appearFloorMax: 9,
    isSummon: false,
    sortOrder: 4,
    actions: [
      {
        code: 'skeleton_strike',
        name: '骨打ち',
        effects: [{ effectType: 'damage', params: { mult: 1.0 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'skeleton_curse',
        name: '骨の呪い',
        effects: [{ effectType: 'status', params: { status: 'weaken', chancePct: 80 } }],
        intentIcon: 'debuff',
        intentLabel: '弱体',
      },
      {
        // カウンター仕様（DEC-054）: 実行ターン終了まで被ダメ50%減 + 直接ダメージ被弾ごとに
        // mult0.5で即時反撃（1ターン最大2回・クリなし・無属性）。反撃への反撃は発生しない
        code: 'skeleton_guard',
        name: '白骨の構え',
        effects: [
          { effectType: 'guard', params: { damageCutPct: 50 } },
          {
            effectType: 'counter',
            params: { mult: 0.5, onlyWhenDefending: false, chancePct: 100, maxPerTurn: 2 },
          },
        ],
        intentIcon: 'shield', // guard系intentは暫定shield（ISSUE-113）
        intentLabel: '防御の構え',
      },
    ],
    aiRules: [
      // 3の倍数ターンに構える
      {
        priority: 10,
        bossPhase: null,
        conditions: { turnMod: { n: 3, eq: 0 } },
        actionCode: 'skeleton_guard',
        weight: 100,
      },
      {
        priority: 20,
        bossPhase: null,
        conditions: { targetStatusMissing: 'weaken' },
        actionCode: 'skeleton_curse',
        weight: 60,
      },
      {
        priority: 20,
        bossPhase: null,
        conditions: { targetStatusMissing: 'weaken' },
        actionCode: 'skeleton_strike',
        weight: 40,
      },
      {
        priority: 100,
        bossPhase: null,
        conditions: null,
        actionCode: 'skeleton_strike',
        weight: 100,
      },
    ],
  },
  // ---- fire_imp（火の小鬼）— burn付与 ----
  {
    code: 'fire_imp',
    name: '火の小鬼',
    enemyType: 'normal',
    element: 'fire',
    baseStats: {
      maxHp: 34,
      atk: 11,
      def: 5,
      spd: 9,
      critRate: 5,
      critDmg: 150,
      eva: 5,
      acc: 0,
      statusRes: 0,
    },
    baseExp: 12,
    baseGold: 15,
    dropTableCode: 'rt_battle_normal',
    appearFloorMin: 4,
    appearFloorMax: 9,
    isSummon: false,
    sortOrder: 5,
    actions: [
      {
        code: 'imp_claw',
        name: '引っかき',
        effects: [{ effectType: 'damage', params: { mult: 0.9 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'imp_firebolt',
        name: '火の粉',
        effects: [
          { effectType: 'damage', params: { mult: 1.1 } },
          { effectType: 'status', params: { status: 'burn', chancePct: 80 } },
        ],
        intentIcon: 'strong_attack', // 炎アイコン（docs/19 §5.5）
        intentLabel: '火炎攻撃',
      },
    ],
    aiRules: [
      {
        priority: 10,
        bossPhase: null,
        conditions: { targetStatusMissing: 'burn' },
        actionCode: 'imp_firebolt',
        weight: 70,
      },
      {
        priority: 10,
        bossPhase: null,
        conditions: { targetStatusMissing: 'burn' },
        actionCode: 'imp_claw',
        weight: 30,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'imp_claw', weight: 60 },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'imp_firebolt', weight: 40 },
    ],
  },
  // ---- orc_champion（オークチャンピオン・エリート）— 2ターンごと強撃（予告あり） ----
  {
    code: 'orc_champion',
    name: 'オークチャンピオン',
    enemyType: 'elite',
    element: 'none',
    baseStats: {
      maxHp: 50,
      atk: 12,
      def: 8,
      spd: 8,
      critRate: 5,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 30,
    },
    baseExp: 40,
    baseGold: 60,
    dropTableCode: 'rt_battle_elite',
    appearFloorMin: 3,
    appearFloorMax: 9,
    isSummon: false,
    sortOrder: 6,
    actions: [
      {
        code: 'orc_smash',
        name: '叩きつけ',
        effects: [{ effectType: 'damage', params: { mult: 1.0 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'orc_mighty',
        name: '渾身の一撃',
        effects: [{ effectType: 'damage', params: { mult: 2.0 } }],
        intentIcon: 'strong_attack',
        intentLabel: '強攻撃',
      },
      {
        code: 'orc_warcry',
        name: '雄叫び',
        // atk+25%/3T（16章DEC-035の初期値）。target='self'は敵専用拡張キー
        effects: [
          {
            effectType: 'buff',
            params: { buff: 'atkUp', valuePct: 25, turns: 3, target: 'self' },
          },
        ],
        intentIcon: 'buff',
        intentLabel: '強化',
      },
    ],
    aiRules: [
      // 偶数ターンは必ず強撃（intent先抽選により前ターン終了時点で予告される）
      {
        priority: 10,
        bossPhase: null,
        conditions: { turnMod: { n: 2, eq: 0 } },
        actionCode: 'orc_mighty',
        weight: 100,
      },
      {
        priority: 20,
        bossPhase: null,
        conditions: { selfBuffMissing: 'atkUp', hpBelow: 0.7 },
        actionCode: 'orc_warcry',
        weight: 100,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'orc_smash', weight: 100 },
    ],
  },
  // ---- dark_shaman（闇のシャーマン・エリート）— デバフ・仲間強化・召喚 ----
  {
    code: 'dark_shaman',
    name: '闇のシャーマン',
    enemyType: 'elite',
    element: 'water',
    baseStats: {
      maxHp: 42,
      atk: 11,
      def: 7,
      spd: 10,
      critRate: 5,
      critDmg: 150,
      eva: 5,
      acc: 0,
      statusRes: 30,
    },
    baseExp: 40,
    baseGold: 60,
    dropTableCode: 'rt_battle_elite',
    appearFloorMin: 4,
    appearFloorMax: 9,
    isSummon: false,
    sortOrder: 7,
    actions: [
      {
        code: 'shaman_bolt',
        name: '深淵の弾',
        effects: [{ effectType: 'damage', params: { mult: 1.1 } }], // 水属性（敵elementに従う）
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'shaman_weaken',
        name: '衰弱の呪い',
        effects: [{ effectType: 'status', params: { status: 'weaken', chancePct: 90 } }],
        intentIcon: 'debuff',
        intentLabel: '弱体',
      },
      {
        code: 'shaman_bless',
        name: '邪神の加護',
        // 敵側全体にatk+25%/3T。target='allyAll'は敵専用拡張キー
        effects: [
          {
            effectType: 'buff',
            params: { buff: 'atkUp', valuePct: 25, turns: 3, target: 'allyAll' },
          },
        ],
        intentIcon: 'buff',
        intentLabel: '全体強化',
      },
      {
        // 召喚仕様（DEC-053）: slime1体。場は最大3体（満員時はshaman_boltへフォールバック DEC-036）。
        // 召喚slimeはEXP・ゴールド・ドロップ0、行動は次ターンから
        code: 'shaman_summon',
        name: '深淵の呼び声',
        effects: [{ effectType: 'summon', params: { enemyCode: 'slime', count: 1 } }],
        intentIcon: 'summon',
        intentLabel: '召喚',
      },
    ],
    aiRules: [
      // 単独になったら必ず召喚（初手も単独出現のため1ターン目に召喚予告。ISSUE-115）
      {
        priority: 10,
        bossPhase: null,
        conditions: { allyCount: { lt: 2 } },
        actionCode: 'shaman_summon',
        weight: 100,
      },
      {
        priority: 20,
        bossPhase: null,
        conditions: { targetStatusMissing: 'weaken' },
        actionCode: 'shaman_weaken',
        weight: 70,
      },
      {
        priority: 20,
        bossPhase: null,
        conditions: { targetStatusMissing: 'weaken' },
        actionCode: 'shaman_bolt',
        weight: 30,
      },
      {
        priority: 30,
        bossPhase: null,
        conditions: { allyBuffMissing: 'atkUp', allyCount: { gte: 2 } },
        actionCode: 'shaman_bless',
        weight: 60,
      },
      {
        priority: 30,
        bossPhase: null,
        conditions: { allyBuffMissing: 'atkUp', allyCount: { gte: 2 } },
        actionCode: 'shaman_bolt',
        weight: 40,
      },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'shaman_bolt', weight: 100 },
    ],
  },
  // ---- ruin_guardian（遺跡の守護者・ボス）— 3フェーズ（docs/19 §6） ----
  // フェーズ1「静観」HP100〜70%超 / フェーズ2「覚醒」70〜40%超 / フェーズ3「暴走」40〜0%
  // フェーズ判定はaiRulesのhpBelow条件が正（bossPhase列は注記）。
  // 「崩落の一撃」はフェーズ移行の翌行動で必ず発動（phaseShiftPending=移行ターン終了時に
  // intentへ予告表示→次の自行動で実行 = 1ターン前予告）
  {
    code: 'ruin_guardian',
    name: '遺跡の守護者',
    enemyType: 'boss',
    element: 'none',
    baseStats: {
      maxHp: 60,
      atk: 13,
      def: 10,
      spd: 9,
      critRate: 5,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 60,
      // 怒り状態（CORE_SPEC §5.7 / docs/19 §6.3）: HP50%以下で恒久atk+30%（解除不能・バフ枠外）
      enrage: { hpBelow: 0.5, atkUpPct: 30 },
    },
    baseExp: 150,
    baseGold: 200,
    dropTableCode: 'rt_boss',
    appearFloorMin: 10,
    appearFloorMax: 10,
    isSummon: false,
    sortOrder: 8,
    actions: [
      {
        code: 'guardian_smash',
        name: '守護者の一撃',
        effects: [{ effectType: 'damage', params: { mult: 1.0 } }],
        intentIcon: 'attack',
        intentLabel: '攻撃',
      },
      {
        code: 'guardian_crush',
        name: '圧砕',
        effects: [
          { effectType: 'damage', params: { mult: 1.6 } },
          { effectType: 'status', params: { status: 'stun', chancePct: 20 } },
        ],
        intentIcon: 'strong_attack',
        intentLabel: '強攻撃',
      },
      {
        code: 'guardian_harden',
        name: '硬化',
        effects: [
          {
            effectType: 'buff',
            params: { buff: 'defUp', valuePct: 25, turns: 3, target: 'self' },
          },
        ],
        intentIcon: 'buff',
        intentLabel: '硬化',
      },
      {
        code: 'guardian_roar',
        name: '崩壊の咆哮',
        // docs/19表記 {"status":{"code":"atkDown","chance":90}}。atkDownはデバフのためdebuff型で表現
        // （chancePctは敵専用拡張キー。atk-25%/3T・成功率90%）
        effects: [
          {
            effectType: 'debuff',
            params: { debuff: 'atkDown', valuePct: 25, turns: 3, chancePct: 90 },
          },
        ],
        intentIcon: 'debuff',
        intentLabel: '弱体',
      },
      {
        code: 'guardian_quake',
        name: '崩落の一撃',
        // 全体攻撃（MVPは対象=プレイヤー1体）。必ず1ターン前に予告される
        effects: [{ effectType: 'damage_aoe', params: { mult: 2.2 } }],
        intentIcon: 'strong_attack',
        intentLabel: '全体強攻撃（予告）',
      },
    ],
    aiRules: [
      // フェーズ移行の翌行動は必ず「崩落の一撃」（1ターン前予告。各フェーズ移行につき1回）
      {
        priority: 5,
        bossPhase: null, // P1→P2 / P2→P3 の両移行で発火するためフェーズ注記なし
        conditions: { phaseShiftPending: true },
        actionCode: 'guardian_quake',
        weight: 100,
      },
      // P3中は3ターンごとに再発動（毎回予告つき）
      {
        priority: 10,
        bossPhase: 3,
        conditions: { hpBelow: 0.4, turnsInPhaseMod: { n: 3, eq: 0 } },
        actionCode: 'guardian_quake',
        weight: 100,
      },
      // フェーズ3「暴走」（HP40%未満）
      {
        priority: 20,
        bossPhase: 3,
        conditions: { hpBelow: 0.4 },
        actionCode: 'guardian_smash',
        weight: 30,
      },
      {
        priority: 20,
        bossPhase: 3,
        conditions: { hpBelow: 0.4 },
        actionCode: 'guardian_crush',
        weight: 40,
      },
      {
        priority: 20,
        bossPhase: 3,
        conditions: { hpBelow: 0.4 },
        actionCode: 'guardian_roar',
        weight: 10,
      },
      {
        priority: 20,
        bossPhase: 3,
        conditions: { hpBelow: 0.4 },
        actionCode: 'guardian_quake',
        weight: 20,
      },
      // フェーズ2「覚醒」（HP70%未満）
      {
        priority: 30,
        bossPhase: 2,
        conditions: { hpBelow: 0.7 },
        actionCode: 'guardian_smash',
        weight: 40,
      },
      {
        priority: 30,
        bossPhase: 2,
        conditions: { hpBelow: 0.7 },
        actionCode: 'guardian_crush',
        weight: 30,
      },
      {
        priority: 30,
        bossPhase: 2,
        conditions: { hpBelow: 0.7 },
        actionCode: 'guardian_harden',
        weight: 10,
      },
      {
        priority: 30,
        bossPhase: 2,
        conditions: { hpBelow: 0.7 },
        actionCode: 'guardian_roar',
        weight: 20,
      },
      // フェーズ1「静観」基本重みテーブル
      {
        priority: 100,
        bossPhase: 1,
        conditions: null,
        actionCode: 'guardian_smash',
        weight: 60,
      },
      {
        priority: 100,
        bossPhase: 1,
        conditions: null,
        actionCode: 'guardian_crush',
        weight: 20,
      },
      {
        priority: 100,
        bossPhase: 1,
        conditions: null,
        actionCode: 'guardian_harden',
        weight: 20,
      },
    ],
  },
];

// --- docs間の差異と採用判断（優先順: 19 > 18 > 17 > 05） ---
// - batのcritRate10%はdocs/19（DEC-050）を採用（16章DEC-033未記載の追加値。ISSUE-114）
// - ボスP3閾値40% / ドロップ率10/30/50/100はdocs/19を採用（16章は改訂済み。ISSUE-111/112）
// - guardian_roarはdocs/19で status:{code:"atkDown"} 表記だが、atkDownはSTATUS_CODESでなく
//   DEBUFF_CODESのため effect_type=debuff（chancePct付き）へ正規化
// - 怒り状態（atk+30%）は enemies テーブルに専用列がないため baseStats.enrage として保持
// - skeleton_guardのcounterは行動効果自体が防御を内包するため onlyWhenDefending=false
//   （maxPerTurn=2 は敵専用拡張キー。DEC-054）
