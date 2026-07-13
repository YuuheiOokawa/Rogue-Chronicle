// ランダムイベントマスタ 10種（docs/17_Dungeon_Design.md §6.1 完全転記。数値はDEC-043）
// - EVENTノード進入時に出現階層条件を満たすものから等重み抽選（weight=100で統一）
// - 各choiceのoutcomesはprobability合計100。HPダメージはmaxHp基準%・floor・下限1（イベント死亡なし）
import type { RandomEventMaster } from './types';

export const RANDOM_EVENTS: RandomEventMaster[] = [
  // EV-01
  {
    code: 'ev_altar',
    name: '怪しい祭壇',
    flavorText: '黒曜石の祭壇が鈍く脈打っている。乾いた血の痕が、祈った者の末路を物語る。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 2,
    maxFloor: 9,
    sortOrder: 1,
    choices: [
      {
        order: 1,
        label: '祈る',
        outcomes: [
          {
            probability: 60,
            resultText: '祭壇が応えた。力が漲る（攻撃力+8%）。',
            effects: [{ type: 'runStatModPct', stat: 'atk', valuePct: 8 }],
          },
          {
            probability: 40,
            resultText: '祭壇が生気を吸い上げた（最大HP-8%）。',
            effects: [{ type: 'runStatModPct', stat: 'maxHp', valuePct: -8 }],
          },
        ],
      },
      {
        order: 2,
        label: '血を捧げる（現HPの20%消費）',
        outcomes: [
          {
            probability: 100,
            resultText: '血が祭壇に吸い込まれ、代わりに遺物が現れた。',
            effects: [{ type: 'loseHpCurrentPct', pct: 20 }, { type: 'grantRelic' }],
          },
        ],
      },
      {
        order: 3,
        label: '立ち去る',
        outcomes: [{ probability: 100, resultText: '祭壇には近寄らなかった。', effects: [] }],
      },
    ],
  },
  // EV-02
  {
    code: 'ev_peddler',
    name: '行商人',
    flavorText:
      '遺跡の奥だというのに、ランタンを提げた男が荷を広げて笑う。「掘り出し物だよ、旦那」',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 2,
    maxFloor: 9,
    sortOrder: 2,
    choices: [
      {
        order: 1,
        label: '装備を買う（70G）',
        outcomes: [
          {
            probability: 100,
            resultText: '布に包まれた装備を受け取った。',
            effects: [
              { type: 'gold', amount: -70 },
              { type: 'grantEquipment', rarityWeights: { common: 60, rare: 35, epic: 5 } },
            ],
          },
        ],
      },
      {
        order: 2,
        label: '薬を買う（35G）',
        outcomes: [
          {
            probability: 100,
            resultText: 'ポーションと万能解毒薬を受け取った。',
            effects: [
              { type: 'gold', amount: -35 },
              { type: 'grantConsumable', itemCode: 'potion', count: 1 },
              { type: 'grantConsumable', itemCode: 'antidote', count: 1 },
            ],
          },
        ],
      },
      {
        order: 3,
        label: '立ち去る',
        outcomes: [{ probability: 100, resultText: '男は肩をすくめて荷をまとめた。', effects: [] }],
      },
    ],
  },
  // EV-03
  {
    code: 'ev_trap',
    name: '罠の通路',
    flavorText: '床一面に細い糸が張り巡らされている。奥には先人の亡骸と、光る何か。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 3,
    maxFloor: 9,
    sortOrder: 3,
    choices: [
      {
        order: 1,
        label: '慎重に解除する',
        outcomes: [
          {
            probability: 70,
            resultText: '罠を解除して通過した。部品を換金して30Gを得た。',
            effects: [{ type: 'gold', amount: 30 }],
          },
          {
            probability: 30,
            resultText: '糸に触れてしまった。矢が体を掠める（最大HPの12%ダメージ）。',
            effects: [{ type: 'damageHpPct', pct: 12 }],
          },
        ],
      },
      {
        order: 2,
        label: '走り抜ける',
        outcomes: [
          { probability: 50, resultText: '間一髪、無傷で走り抜けた。', effects: [] },
          {
            probability: 50,
            resultText: '罠が連鎖して作動した（最大HPの18%ダメージ）。',
            effects: [{ type: 'damageHpPct', pct: 18 }],
          },
        ],
      },
      {
        order: 3,
        label: '引き返す',
        outcomes: [
          { probability: 100, resultText: '危険を冒す価値はないと判断した。', effects: [] },
        ],
      },
    ],
  },
  // EV-04
  {
    code: 'ev_hidden_path',
    name: '隠し通路',
    flavorText: '壁の煉瓦が一枚だけ色が違う。押し込むと、冷たい風が吹き出す隙間が開いた。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 2,
    maxFloor: 8,
    sortOrder: 4,
    choices: [
      {
        order: 1,
        label: '進む',
        outcomes: [
          {
            probability: 60,
            resultText: '隠し部屋に宝箱が眠っていた。',
            effects: [{ type: 'treasureRoll', tableCode: 'rt_treasure_normal' }],
          },
          {
            probability: 40,
            resultText: '待ち伏せだ！敵が襲いかかってくる。',
            effects: [{ type: 'startBattle', encounter: 'random_battle' }],
          },
        ],
      },
      {
        order: 2,
        label: '無視する',
        outcomes: [
          { probability: 100, resultText: '隙間はそのままにして先へ進んだ。', effects: [] },
        ],
      },
    ],
  },
  // EV-05
  {
    code: 'ev_cursed_chest',
    name: '呪いの宝箱',
    flavorText: '鎖で何重にも封じられた宝箱。鎖の方が、中身より雄弁だ。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 3,
    maxFloor: 9,
    sortOrder: 5,
    choices: [
      {
        order: 1,
        label: '開ける',
        outcomes: [
          {
            probability: 45,
            resultText: '見事な装備が収められていた。',
            effects: [{ type: 'grantEquipment', rarityWeights: { epic: 100 } }],
          },
          {
            probability: 25,
            resultText: '金貨が詰まっていた（90G）。',
            effects: [{ type: 'gold', amount: 90 }],
          },
          {
            probability: 30,
            resultText: '黒い靄が噴き出し、体に纏わりついた（最大HP-10%、次の戦闘で衰弱）。',
            effects: [
              { type: 'runStatModPct', stat: 'maxHp', valuePct: -10 },
              { type: 'weakenNextBattle' },
            ],
          },
        ],
      },
      {
        order: 2,
        label: '開けない',
        outcomes: [{ probability: 100, resultText: '鎖の警告に従うことにした。', effects: [] }],
      },
    ],
  },
  // EV-06
  {
    code: 'ev_wounded',
    name: '負傷した冒険者',
    flavorText: '柱の陰で冒険者がうずくまっている。「頼む……薬を……」',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 2,
    maxFloor: 8,
    sortOrder: 6,
    choices: [
      {
        order: 1,
        label: '手当てする（ポーション1個消費。未所持なら現HPの15%消費）',
        outcomes: [
          {
            probability: 80,
            resultText: '冒険者は礼を言い、60Gを差し出した。',
            effects: [
              { type: 'consumeItemOrHpPct', itemCode: 'potion', fallbackHpCurrentPct: 15 },
              { type: 'gold', amount: 60 },
            ],
          },
          {
            probability: 20,
            resultText: '冒険者は礼の60Gに加え、大切にしていた遺物を託してくれた。',
            effects: [
              { type: 'consumeItemOrHpPct', itemCode: 'potion', fallbackHpCurrentPct: 15 },
              { type: 'gold', amount: 60 },
              { type: 'grantRelic' },
            ],
          },
        ],
      },
      {
        order: 2,
        label: '荷物を漁る',
        outcomes: [
          {
            probability: 60,
            resultText: '荷袋から40Gを見つけた。',
            effects: [{ type: 'gold', amount: 40 }],
          },
          { probability: 40, resultText: '荷袋は空だった。', effects: [] },
        ],
      },
      {
        order: 3,
        label: '立ち去る',
        outcomes: [{ probability: 100, resultText: '関わらないことにした。', effects: [] }],
      },
    ],
  },
  // EV-07
  {
    code: 'ev_gambler',
    name: '賭博師',
    flavorText:
      '骸骨の山の上で男がサイコロを転がしている。「遺跡の中じゃ、金の使い道もないだろう？」',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 3,
    maxFloor: 9,
    sortOrder: 7,
    choices: [
      {
        order: 1,
        label: '30G賭ける',
        outcomes: [
          {
            probability: 45,
            resultText: '勝った！75Gを獲得した（賭け金30Gを引いて+45G）。',
            effects: [{ type: 'gold', amount: 45 }],
          },
          {
            probability: 55,
            resultText: '負けた。賭け金30Gは没収された。',
            effects: [{ type: 'gold', amount: -30 }],
          },
        ],
      },
      {
        order: 2,
        label: '80G賭ける',
        outcomes: [
          {
            probability: 45,
            resultText: '勝った！200Gを獲得した（賭け金80Gを引いて+120G）。',
            effects: [{ type: 'gold', amount: 120 }],
          },
          {
            probability: 55,
            resultText: '負けた。賭け金80Gは没収された。',
            effects: [{ type: 'gold', amount: -80 }],
          },
        ],
      },
      {
        order: 3,
        label: '賭けない',
        outcomes: [{ probability: 100, resultText: '男の誘いには乗らなかった。', effects: [] }],
      },
    ],
  },
  // EV-08
  {
    code: 'ev_inscription',
    name: '古代の碑文',
    flavorText: '壁一面に刻まれた古代文字が、微かに燐光を放っている。読めそうな気がする。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 4,
    maxFloor: 9,
    sortOrder: 8,
    choices: [
      {
        order: 1,
        label: '解読を試みる',
        outcomes: [
          {
            probability: 65,
            resultText: '碑文の知識が流れ込んできた（EXP+15×階層）。',
            effects: [{ type: 'grantExpPerFloor', amountPerFloor: 15 }],
          },
          { probability: 35, resultText: '文字は読めなかった。', effects: [] },
        ],
      },
      {
        order: 2,
        label: '魔力に触れる',
        outcomes: [
          {
            probability: 40,
            resultText: '魔力が技に宿った（ランダムな所持スキル1つがLv+1）。',
            effects: [{ type: 'upgradeRandomSkill' }],
          },
          {
            probability: 60,
            resultText: '魔力が暴走し、体を焼いた（最大HPの8%ダメージ）。',
            effects: [{ type: 'damageHpPct', pct: 8 }],
          },
        ],
      },
      {
        order: 3,
        label: '立ち去る',
        outcomes: [{ probability: 100, resultText: '碑文には触れなかった。', effects: [] }],
      },
    ],
  },
  // EV-09
  {
    code: 'ev_spring',
    name: '癒しの泉',
    flavorText: '崩れた聖堂の中央に、澄んだ泉が湧いている。水面が淡く光る。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 2,
    maxFloor: 9,
    sortOrder: 9,
    choices: [
      {
        order: 1,
        label: '泉に浸かる',
        outcomes: [
          {
            probability: 100,
            resultText: '傷が癒えていく（HP35%回復）。',
            effects: [{ type: 'healHpPct', pct: 35 }],
          },
        ],
      },
      {
        order: 2,
        label: '水を汲む',
        outcomes: [
          {
            probability: 100,
            resultText: '泉の水をポーションとして持ち帰った。',
            effects: [{ type: 'grantConsumable', itemCode: 'potion', count: 1 }],
          },
        ],
      },
      {
        order: 3,
        label: '泉の底を探る',
        outcomes: [
          {
            probability: 50,
            resultText: '底から古い金貨を拾い上げた（45G）。',
            effects: [{ type: 'gold', amount: 45 }],
          },
          {
            probability: 50,
            resultText: '泉の主の怒りに触れた（最大HPの10%ダメージ）。',
            effects: [{ type: 'damageHpPct', pct: 10 }],
          },
        ],
      },
    ],
  },
  // EV-10
  {
    code: 'ev_ambush',
    name: '盗賊の待ち伏せ',
    flavorText: '「命が惜しければ有り金を置いていきな」——瓦礫の上から複数の影が降ってくる。',
    nodeType: 'EVENT',
    weight: 100,
    minFloor: 3,
    maxFloor: 9,
    sortOrder: 10,
    choices: [
      {
        order: 1,
        label: '迎え撃つ',
        outcomes: [
          {
            probability: 100,
            resultText: '盗賊どもが襲いかかってきた！（勝利で通常報酬+40G）',
            effects: [
              {
                type: 'startBattle',
                encounter: 'fixed',
                enemyCodes: ['goblin', 'goblin'],
                bonusGold: 40,
              },
            ],
          },
        ],
      },
      {
        order: 2,
        label: '通行料を払う（所持ゴールドの25%）',
        outcomes: [
          {
            probability: 100,
            resultText: '有り金の一部を渡し、道を開けさせた。',
            effects: [{ type: 'goldPctLoss', pct: 25 }],
          },
        ],
      },
      {
        order: 3,
        label: '強行突破',
        outcomes: [
          { probability: 55, resultText: '影の間を駆け抜け、無傷で振り切った。', effects: [] },
          {
            probability: 45,
            resultText:
              '逃げ切ったが手傷を負い、財布も軽くなった（最大HPの15%ダメージ・20G喪失）。',
            effects: [
              { type: 'damageHpPct', pct: 15 },
              { type: 'gold', amount: -20 },
            ],
          },
        ],
      },
    ],
  },
];

// --- docs間の差異と採用判断 ---
// - EV-06「お礼60G+20%: レリック1個」は outcomes 2行（80%: 60Gのみ / 20%: 60G+レリック）に分解
//   （確率合計100の制約に合わせた等価表現）
// - EV-07の賭け結果は「賭け金支払→当選額獲得」を純増減のgold 1効果（+45/+120/-30/-80）に正規化
