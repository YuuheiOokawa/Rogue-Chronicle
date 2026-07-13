// EXP加算・レベルアップ（docs/20 §2.19-2.20 / CORE_SPEC §5.4）。
import type { RunCharacter } from '@/domain/dungeon/run-state';

export const RUN_LEVEL_CAP = 20;

/** 必要EXP: expToNext(L) = floor(20 × L^1.5) */
export function expToNext(level: number): number {
  return Math.floor(20 * Math.pow(level, 1.5));
}

export interface GrowthRates {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
}

/**
 * 1レベル分の成長適用（docs/20 §2.20）。
 * maxHp+8%・atk+5%・def+5%・spd+2%（各×成長係数、切り捨て・最低+1）。現在HPは割合維持。SPは変化なし。
 */
export function levelUp(character: RunCharacter, growth: GrowthRates): RunCharacter {
  const grow = (base: number, ratePct: number, rate: number): number => {
    const delta = Math.max(1, Math.floor(base * (ratePct / 100) * rate));
    return base + delta;
  };
  const newMaxHp = grow(character.stats.maxHp, 8, growth.maxHp);
  const newAtk = grow(character.stats.atk, 5, growth.atk);
  const newDef = grow(character.stats.def, 5, growth.def);
  const newSpd = grow(character.stats.spd, 2, growth.spd);

  const hpRatio = character.hp / character.stats.maxHp;
  const newHp = Math.min(newMaxHp, Math.floor(newMaxHp * hpRatio));

  return {
    ...character,
    level: character.level + 1,
    stats: { ...character.stats, maxHp: newMaxHp, atk: newAtk, def: newDef, spd: newSpd },
    hp: newHp,
  };
}

export interface GainExperienceResult {
  character: RunCharacter;
  levelUps: number;
}

/**
 * EXP加算とレベルアップ回数の算定（docs/20 §2.19。複数レベル一括対応）。
 *
 * 実装判断（docs未記載のため決定): character.expは「現レベル内の進行度」として扱い、
 * レベルアップのたびにexpToNext(L)分を消費（減算）して繰り越す方式（一般的なRPGの経験値実装）。
 * ラン内レベル上限20到達後は消費先が無いため、以降のexpは減算されず素のまま保持する
 * （CORE_SPEC「上限20で停止しEXPは切り捨てず保持」）。
 */
export function gainExperience(
  character: RunCharacter,
  exp: number,
  growth: GrowthRates,
): GainExperienceResult {
  let current = character;
  let remainingExp = character.exp + exp;
  let levelUps = 0;

  while (current.level < RUN_LEVEL_CAP) {
    const need = expToNext(current.level);
    if (remainingExp < need) break;
    remainingExp -= need;
    current = levelUp(current, growth);
    levelUps += 1;
  }

  return { character: { ...current, exp: remainingExp }, levelUps };
}
