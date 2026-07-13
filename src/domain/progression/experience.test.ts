import { describe, expect, it } from 'vitest';

import type { RunCharacter } from '@/domain/dungeon/run-state';

import { expToNext, gainExperience, levelUp, RUN_LEVEL_CAP } from './experience';

const growth = { maxHp: 1.0, atk: 1.0, def: 1.0, spd: 1.0 };

function makeCharacter(overrides: Partial<RunCharacter> = {}): RunCharacter {
  return {
    code: 'swordsman_rain',
    level: 1,
    exp: 0,
    stats: { maxHp: 100, atk: 12, def: 10, spd: 10, critRate: 5, critDmg: 150, eva: 0, acc: 0, statusRes: 0 },
    hp: 100,
    sp: 10,
    maxSp: 10,
    ...overrides,
  };
}

describe('expToNext', () => {
  it('floor(20×L^1.5)の早見表と一致する（CORE_SPEC §4.6）', () => {
    expect(expToNext(1)).toBe(20);
    expect(expToNext(2)).toBe(56);
    expect(expToNext(3)).toBe(103);
    expect(expToNext(4)).toBe(160);
    expect(expToNext(5)).toBe(223);
  });
});

describe('levelUp', () => {
  it('maxHp+8%,atk+5%,def+5%,spd+2%を成長係数込みで切り捨て適用する', () => {
    const c = makeCharacter();
    const next = levelUp(c, growth);
    expect(next.stats.maxHp).toBe(100 + Math.floor(100 * 0.08));
    expect(next.stats.atk).toBe(12 + Math.max(1, Math.floor(12 * 0.05)));
    expect(next.stats.def).toBe(10 + Math.max(1, Math.floor(10 * 0.05)));
    expect(next.stats.spd).toBe(10 + Math.max(1, Math.floor(10 * 0.02)));
    expect(next.level).toBe(2);
  });

  it('増分は最低+1を保証する（小さい基礎値でも成長する）', () => {
    const c = makeCharacter({ stats: { ...makeCharacter().stats, spd: 1 } });
    const next = levelUp(c, growth);
    expect(next.stats.spd).toBe(2); // floor(1*0.02)=0だが最低+1
  });

  it('現在HPは割合維持（全回復しない）', () => {
    const c = makeCharacter({ hp: 60 }); // 60/100
    const next = levelUp(c, growth);
    expect(next.hp).toBe(Math.floor(next.stats.maxHp * 0.6));
  });

  it('SPは変化しない', () => {
    const c = makeCharacter({ sp: 4 });
    const next = levelUp(c, growth);
    expect(next.sp).toBe(4);
  });
});

describe('gainExperience', () => {
  it('レベルアップしないEXP量では加算のみ', () => {
    const c = makeCharacter();
    const r = gainExperience(c, 5, growth);
    expect(r.levelUps).toBe(0);
    expect(r.character.exp).toBe(5);
    expect(r.character.level).toBe(1);
  });

  it('必要EXP境界値: ちょうどexpToNext(1)=20でレベルアップする', () => {
    const c = makeCharacter();
    const r = gainExperience(c, 20, growth);
    expect(r.levelUps).toBe(1);
    expect(r.character.level).toBe(2);
    expect(r.character.exp).toBe(0);
  });

  it('境界値-1（19）ではレベルアップしない', () => {
    const c = makeCharacter();
    const r = gainExperience(c, 19, growth);
    expect(r.levelUps).toBe(0);
  });

  it('複数レベル一括でレベルアップする', () => {
    const c = makeCharacter();
    // 20(→L2) + 56(→L3) + 10 余り = 86
    const r = gainExperience(c, 20 + 56 + 10, growth);
    expect(r.levelUps).toBe(2);
    expect(r.character.level).toBe(3);
    expect(r.character.exp).toBe(10);
  });

  it('ラン内レベル上限20で停止し、以降のEXPは切り捨てず保持する', () => {
    const c = makeCharacter({ level: RUN_LEVEL_CAP, exp: 0 });
    const r = gainExperience(c, 99999, growth);
    expect(r.levelUps).toBe(0);
    expect(r.character.level).toBe(RUN_LEVEL_CAP);
    expect(r.character.exp).toBe(99999);
  });

  it('上限到達直前から大量のEXPを得ても上限で頭打ちになる', () => {
    const c = makeCharacter({ level: RUN_LEVEL_CAP - 1, exp: 0 });
    const r = gainExperience(c, 999999, growth);
    expect(r.character.level).toBe(RUN_LEVEL_CAP);
    expect(r.levelUps).toBe(1);
  });
});
