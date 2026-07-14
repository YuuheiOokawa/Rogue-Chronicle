// 図鑑画面の表示ラベル（色だけに頼らずアイコン+テキスト併用。docs/09 §2.6）
export const RARITY_LABELS: Record<string, string> = {
  common: 'コモン',
  rare: 'レア',
  epic: 'エピック',
};

export const RARITY_COLOR_CLASS: Record<string, string> = {
  common: 'text-content-muted',
  rare: 'text-primary',
  epic: 'text-accent-gold',
};

export const ELEMENT_LABELS: Record<string, string> = {
  none: '無属性',
  fire: '火属性',
  water: '水属性',
  wind: '風属性',
};

export const ELEMENT_ICONS: Record<string, string> = {
  none: '⬜',
  fire: '🔥',
  water: '💧',
  wind: '🌪',
};

export function elementText(element: string): string {
  return `${ELEMENT_ICONS[element] ?? ''}${ELEMENT_LABELS[element] ?? element}`;
}

export const EQUIPMENT_SLOT_LABELS: Record<string, string> = {
  weapon: '武器',
  armor: '防具',
  accessory: 'アクセ',
};

export const ENEMY_TYPE_LABELS: Record<string, string> = {
  normal: '雑魚',
  strong: '強敵',
  elite: 'エリート',
  boss: 'ボス',
};

export const SKILL_TARGET_TYPE_LABELS: Record<string, string> = {
  enemy_single: '単体',
  enemy_all: '全体',
  self: '自分',
};

export const RELIC_TRIGGER_LABELS: Record<string, string> = {
  always: '常時',
  battle_start: '戦闘開始時',
  turn_start: 'ターン開始時',
  turn_end: 'ターン終了時',
  on_low_hp: 'HP低下時',
  on_kill: '撃破時',
  node_enter: 'ノード進入時',
};
