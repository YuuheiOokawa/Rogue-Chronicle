// ラン内装備変更時のステータス再計算（docs/13 API-507 / docs/20 createInitialRunStateと同一規則）。
// createInitialRunState（run-state.ts）は「基礎値+装備加算（得意武器一致は装備値+10%）」を
// ラン開始時に1回だけ計算するが、ラン中は成長（レベルアップ）やイベント効果（runStatModPct）で
// character.statsが直接書き換わるため「基礎値」が残らない。そのため装備変更は
// 「外す装備の加算分を引く→着ける装備の加算分を足す」という可逆な差分適用方式を取る
// （createInitialRunStateと同じ Math.floor(value × mod) の整数加算のため、
//  同一の計算式で足したものは同一の計算式で正確に引ける）。
import type { EquipmentMaster } from '@/constants/masters/types';
import { WEAPON_TYPES } from '@/constants/masters/types';

import type { RunCharacter } from './run-state';

export type WeaponType = (typeof WEAPON_TYPES)[number];

function equipmentStatMod(equip: EquipmentMaster, favoredWeaponType: WeaponType): number {
  const favored = equip.slot === 'weapon' && equip.weaponType != null && equip.weaponType === favoredWeaponType;
  return favored ? 1.1 : 1.0; // 得意武器: 装備性能+10%（docs/18）
}

function statsWithDelta(
  stats: RunCharacter['stats'],
  equip: EquipmentMaster | null,
  favoredWeaponType: WeaponType,
  sign: 1 | -1,
): RunCharacter['stats'] {
  if (!equip) return stats;
  const mod = equipmentStatMod(equip, favoredWeaponType);
  const next = { ...stats };
  for (const [key, value] of Object.entries(equip.baseStats)) {
    if (typeof value !== 'number') continue;
    if (key in next) {
      const k = key as keyof typeof next;
      next[k] = next[k] + sign * Math.floor(value * mod);
    }
  }
  return next;
}

/**
 * 装備スロットの付け替えに伴うステータス再計算（docs/13 API-507手順3）。
 * removed（旧装備、無ければnull）の加算分を除去し、added（新装備、無ければnull）の加算分を加える。
 * 現在HPは新maxHpを超えないようclampする（減少方向のみ。増加時は現在HPをそのまま維持）。
 */
export function recalcStatsForEquipmentChange(
  character: RunCharacter,
  favoredWeaponType: WeaponType,
  removed: EquipmentMaster | null,
  added: EquipmentMaster | null,
): RunCharacter {
  let stats = statsWithDelta(character.stats, removed, favoredWeaponType, -1);
  stats = statsWithDelta(stats, added, favoredWeaponType, 1);
  stats = {
    ...stats,
    maxHp: Math.max(1, stats.maxHp),
    atk: Math.max(0, stats.atk),
    def: Math.max(0, stats.def),
    spd: Math.max(0, stats.spd),
  };
  const hp = Math.min(character.hp, stats.maxHp);
  return { ...character, stats, hp };
}
