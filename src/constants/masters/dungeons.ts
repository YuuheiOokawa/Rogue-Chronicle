// ダンジョンマスタ + ノードタイプマスタ（docs/17_Dungeon_Design.md §2〜§3 完全転記）
import type { DungeonMaster, DungeonNodeTypeMaster } from './types';

export const DUNGEONS: DungeonMaster[] = [
  {
    code: 'forgotten_ruins',
    name: '忘却の遺跡',
    description:
      '記憶を喰らうと伝えられる古代遺跡。持ち出した財宝は翌朝すべて遺跡に戻り、挑む者の記録だけが年代記に刻まれる。',
    floors: 10,
    generationConfig: {
      floorCount: 10,
      nodeCounts: { firstFloor: 1, lastFloor: 1, middleMin: 2, middleMax: 4 },
      edgesPerNode: { min: 1, max: 3 },
      fixedNodes: { firstFloorType: 'BATTLE', lastFloorType: 'BOSS' },
      // タイプ出現重み（階層帯別・合計100。docs/17 §3.3 DEC-042）
      // SHOPは保証枠でのみ配置するため重み0（＝キー省略）
      typeWeightsByFloorBand: [
        {
          floorMin: 1,
          floorMax: 3,
          weights: {
            BATTLE: 46,
            STRONG: 8,
            ELITE: 4, // 階層3のみ有効（階層1〜2はBATTLEへ振替）
            TREASURE: 12,
            REST: 4,
            EVENT: 12,
            BLESS: 4,
            HEAL: 5,
            CURSE: 2, // 階層2はEVENTへ振替（CURSEは階層3以降）
            STORY: 3,
          },
        },
        {
          floorMin: 4,
          floorMax: 6,
          weights: {
            BATTLE: 34,
            STRONG: 13,
            ELITE: 9,
            TREASURE: 10,
            REST: 8,
            EVENT: 12,
            BLESS: 4,
            HEAL: 5,
            CURSE: 2,
            STORY: 3,
          },
        },
        {
          floorMin: 7,
          floorMax: 9,
          weights: {
            BATTLE: 30,
            STRONG: 15,
            ELITE: 12,
            TREASURE: 8,
            REST: 10,
            EVENT: 10,
            BLESS: 5,
            HEAL: 5,
            CURSE: 2,
            STORY: 3,
          },
        },
      ],
      weightReassign: {
        eliteBelowMinFloorTo: 'BATTLE', // 階層1〜2のELITE重みはBATTLEへ（実質BATTLE 50）
        curseBelowMinFloorTo: 'EVENT', // 階層2のCURSE重みはEVENTへ
      },
      constraints: {
        restGuaranteedFloors: [5, 9],
        shopCountMin: 1,
        shopCountMax: 2,
        shopFloorMin: 3,
        shopFloorMax: 9,
        eliteMinFloor: 3,
        curseMinFloor: 3,
        noSameTypeTripleOnPath: true,
        secret: { chance: 0.1, floorMin: 3, floorMax: 8, maxCount: 1 },
      },
    },
    sortOrder: 1,
    difficulties: [
      {
        code: 'normal',
        name: 'ノーマル',
        statMod: 1.0,
        expMod: 1.0,
        rewardMod: 1.0,
        unlockCondition: null,
      },
    ],
  },
];

// ノードタイプ 13種（docs/17 §2。iconKeyはlucide-reactのアイコン名方針 DEC-040）
export const DUNGEON_NODE_TYPES: DungeonNodeTypeMaster[] = [
  {
    code: 'BATTLE',
    name: '通常戦闘',
    iconKey: 'swords',
    description: '通常敵1〜3体と戦闘。勝利でEXP・ゴールド・ドロップ判定（発生率10%）。',
  },
  {
    code: 'STRONG',
    name: '強敵',
    iconKey: 'sword',
    description:
      '強敵補正（HP×1.5, ATK×1.15）の敵1体（階層6以降は50%で通常敵1体随伴）。報酬1.5倍+ドロップ30%。逃走可。',
  },
  {
    code: 'ELITE',
    name: 'エリート',
    iconKey: 'skull',
    description:
      'エリート敵1体（HP×2.0, ATK×1.3）。逃走不可。ドロップ50%（レリック・レア装備の主要入手源）。',
  },
  {
    code: 'BOSS',
    name: 'ボス',
    iconKey: 'crown',
    description: '遺跡の守護者と戦闘（HP×4.0, ATK×1.5）。逃走不可。撃破でダンジョンクリア。',
  },
  {
    code: 'TREASURE',
    name: '宝箱',
    iconKey: 'package',
    description: '宝箱を開封する。装備60% / ゴールド25% / 消耗品15%。',
  },
  {
    code: 'SHOP',
    name: 'ショップ',
    iconKey: 'store',
    description:
      '5枠（装備2/消耗品2/レリック1）の店。価格=基準×(1+0.1×階層)、売却50%。離脱後は再入場不可。',
  },
  {
    code: 'REST',
    name: '休憩',
    iconKey: 'flame',
    description: '「HP50%回復」か「所持スキル1つ強化（Lv+1）」の二択。スキル削除もここで可能。',
  },
  {
    code: 'EVENT',
    name: 'ランダムイベント',
    iconKey: 'help-circle',
    description: 'ランダムイベント10種から出現階層条件を満たすものを等重み抽選。',
  },
  {
    code: 'BLESS',
    name: '強化イベント',
    iconKey: 'sparkles',
    description:
      '「攻撃の加護 atk+8%」「守りの加護 def+8%」「生命の加護 maxHp+10%」の3択から1つ（ラン中永続）。',
  },
  {
    code: 'HEAL',
    name: '回復イベント',
    iconKey: 'heart',
    description: '自動でHP35%回復。さらに25%でポーション1個を入手。',
  },
  {
    code: 'CURSE',
    name: '呪いイベント',
    iconKey: 'flame-skull',
    description:
      '「呪いを受け入れる」= maxHp-10%（ラン中）と引き換えに epic装備50% / レリック50%。「立ち去る」= 変化なし。',
  },
  {
    code: 'STORY',
    name: 'ストーリー',
    iconKey: 'book-open',
    description: '年代記の断章を1つ閲覧し、ソウルシャード+5を獲得する。',
  },
  {
    code: 'SECRET',
    name: '隠し部屋',
    iconKey: 'key',
    description:
      '上位報酬の隠し部屋。rare以上確定の装備1個（rare60/epic40）+ 60G。未踏時は「？？」表示。',
  },
];
