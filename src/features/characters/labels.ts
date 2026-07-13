// キャラクター系画面の表示ラベル（色だけに頼らずアイコン+テキスト併用。docs/09 §2.6）
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

export const WEAPON_TYPE_LABELS: Record<string, string> = {
  sword: '剣',
  rod: '杖',
  dagger: '短剣',
  hammer: '槌',
};

export function elementText(element: string): string {
  return `${ELEMENT_ICONS[element] ?? ''}${ELEMENT_LABELS[element] ?? element}`;
}
