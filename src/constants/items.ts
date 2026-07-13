// 消耗品 3種（docs/05 §3.1 / docs/17 §8〜§9）
// 消耗品はマスタテーブル化せずTS定数で保持する方針（種類が少なく効果がコード側ハンドラ固定のため）。
// codeは types.ts / seed のイベント効果（grantConsumable等）の enum と一致させること
export const CONSUMABLE_CODES = ['potion', 'hi_potion', 'antidote'] as const;
export type ConsumableCode = (typeof CONSUMABLE_CODES)[number];

export type ConsumableEffect =
  | { type: 'heal'; hpPctOfMax: number } // maxHp基準%回復（floor）
  | { type: 'cleanseAll' }; // 状態異常（poison/burn/paralysis/stun/weaken）を全解除

export interface ConsumableItem {
  code: ConsumableCode;
  name: string;
  description: string;
  effect: ConsumableEffect;
  /** ショップ基準価格（表示価格 = floor(basePrice × (1 + 0.1 × 階層))。docs/17 §9 DEC-045） */
  basePrice: number;
  /** 所持上限（各5個。docs/05 §3 仮決定） */
  maxHold: number;
  /** 上限超過時のゴールド換算（+10G。docs/17 §8 / 16章DEC-032） */
  overflowGold: number;
  /** 戦闘中に使用可か（使用は行動を消費） */
  usableInBattle: boolean;
  /** マップ上（戦闘外）で使用可か */
  usableOnMap: boolean;
  sortOrder: number;
}

export const CONSUMABLES: readonly ConsumableItem[] = [
  {
    code: 'potion',
    name: 'ポーション',
    description: 'HPを最大HPの50%回復する。',
    effect: { type: 'heal', hpPctOfMax: 50 },
    basePrice: 40,
    maxHold: 5,
    overflowGold: 10,
    usableInBattle: true,
    usableOnMap: true,
    sortOrder: 1,
  },
  {
    code: 'hi_potion',
    name: 'ハイポーション',
    description: 'HPを最大HPの100%回復する。',
    effect: { type: 'heal', hpPctOfMax: 100 },
    basePrice: 90,
    maxHold: 5,
    overflowGold: 10,
    usableInBattle: true,
    usableOnMap: true,
    sortOrder: 2,
  },
  {
    code: 'antidote',
    name: '万能解毒薬',
    description: 'すべての状態異常（毒・火傷・麻痺・気絶・衰弱）を解除する。',
    effect: { type: 'cleanseAll' },
    basePrice: 30,
    maxHold: 5,
    overflowGold: 10,
    usableInBattle: true,
    usableOnMap: false,
    sortOrder: 3,
  },
] as const;

export const CONSUMABLES_BY_CODE: Record<ConsumableCode, ConsumableItem> = Object.fromEntries(
  CONSUMABLES.map((item) => [item.code, item]),
) as Record<ConsumableCode, ConsumableItem>;

// --- docs間の差異と採用判断（優先順: 19 > 18 > 17 > 05） ---
// - ラインナップ: docs/05 §3.1は potion / sp_potion / antidote、docs/17 §8〜§9は
//   potion / hi_potion / antidote → docs/17 を採用（sp_potionはMVP不採用）
// - hi_potionの回復量は全設計書に未記載のため 100% と仮決定（potion50%の上位・基準価格90Gに整合）
// - 価格: docs/05のポーション40G/解毒薬30GとはDocs/17 DEC-045と同値。sp_potion 50Gは不採用
