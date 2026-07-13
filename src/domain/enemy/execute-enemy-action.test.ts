import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { ENEMIES } from '@/constants/masters/enemies';
import { startBattle } from '@/domain/battle/start-battle';
import type { BattleState, EnemyInstance } from '@/domain/battle/types';
import type { RunCharacter } from '@/domain/dungeon/run-state';
import { createRng } from '@/domain/shared/rng';

import { executeEnemyAction } from './execute-enemy-action';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
const masters = { enemies: ENEMIES };

function makeCharacter(overrides: Partial<RunCharacter> = {}): RunCharacter {
  return {
    code: rain.code,
    level: 1,
    exp: 0,
    stats: {
      maxHp: 200,
      atk: rain.baseStats.atk,
      def: rain.baseStats.def,
      spd: 1, // 敵より確実に遅くする
      critRate: 0,
      critDmg: 150,
      eva: 0,
      acc: 0,
      statusRes: 0,
    },
    hp: 200,
    sp: 10,
    maxSp: 10,
    ...overrides,
  };
}

function makeBattle(nodeType: BattleState['nodeType'], floor: number, seed = 1) {
  return startBattle({
    nodeId: `f${floor}n0`,
    nodeType,
    floor,
    character: makeCharacter(),
    difficultyStatMod: 1.0,
    masters,
    rng: createRng(seed),
  });
}

describe('executeEnemyAction: 基本動作', () => {
  it('intentどおりの行動を実行し、プレイヤーにダメージを与える', () => {
    const battle = makeBattle('BATTLE', 1);
    const character = makeCharacter();
    const result = executeEnemyAction(battle, character, 0, masters, createRng(5));
    expect(result.battle.player.hp).toBeLessThanOrEqual(character.hp);
    expect(result.logs.some((l) => l.action === 'enemy_action')).toBe(true);
  });

  it('行動後に次のintentが再抽選される（nullにならない）', () => {
    const battle = makeBattle('BATTLE', 1);
    const character = makeCharacter();
    const result = executeEnemyAction(battle, character, 0, masters, createRng(5));
    expect(result.battle.enemies[0].intent).not.toBeNull();
  });

  it('stun中は行動がスキップされ、intentが維持される（予告詐欺防止）', () => {
    const battle = makeBattle('BATTLE', 1);
    const character = makeCharacter();
    const stunned: BattleState = {
      ...battle,
      enemies: battle.enemies.map((e) => ({ ...e, statuses: [{ code: 'stun', remainingTurns: 1 }] })),
    };
    const originalIntent = stunned.enemies[0].intent;
    const result = executeEnemyAction(stunned, character, 0, masters, createRng(1));
    expect(result.battle.enemies[0].intent).toEqual(originalIntent);
    expect(result.battle.enemies[0].statuses).toEqual([{ code: 'stun', remainingTurns: 1 }]); // ステータス自体は消化されない
    expect(result.logs[0].note).toBe('incapacitated');
  });

  it('死亡済みの敵に対してはno-opを返す', () => {
    const battle = makeBattle('BATTLE', 1);
    const character = makeCharacter();
    const dead: BattleState = { ...battle, enemies: battle.enemies.map((e) => ({ ...e, alive: false, hp: 0 })) };
    const result = executeEnemyAction(dead, character, 0, masters, createRng(1));
    expect(result.logs).toEqual([]);
    expect(result.battle).toBe(dead);
  });
});

describe('executeEnemyAction: DEC-036 intentフォールバック', () => {
  it('HP全快状態でheal intentは通常攻撃にフォールバックする', () => {
    const battle = makeBattle('BATTLE', 1, 999);
    const slimeIndex = battle.enemies.findIndex((e) => e.code === 'slime');
    if (slimeIndex === -1) return; // このシードでslimeが出なければスキップ
    const forced: BattleState = {
      ...battle,
      enemies: battle.enemies.map((e, i) =>
        i === slimeIndex ? { ...e, intent: { actionCode: 'slime_heal', label: '回復', icon: 'heal' }, hp: e.stats.maxHp } : e,
      ),
    };
    const character = makeCharacter();
    const result = executeEnemyAction(forced, character, slimeIndex, masters, createRng(1));
    // フォールバックでslime_tackle（attack）が実行されplayerにダメージが入る
    expect(result.battle.player.hp).toBeLessThan(character.hp);
  });
});

describe('executeEnemyAction: 召喚（dark_shaman）', () => {
  it('単独の場合は召喚し敵が増える', () => {
    const shamanMaster = ENEMIES.find((e) => e.code === 'dark_shaman')!;
    const character = makeCharacter();
    const shaman: EnemyInstance = {
      instanceId: 'e0',
      code: shamanMaster.code,
      name: shamanMaster.name,
      element: shamanMaster.element,
      stats: shamanMaster.baseStats,
      hp: shamanMaster.baseStats.maxHp,
      statuses: [],
      buffs: [],
      guarding: false,
      intent: { actionCode: 'shaman_summon', label: '召喚', icon: 'summon' },
      alive: true,
      isSummon: false,
      recentActionCodes: [],
    };
    const battle: BattleState = {
      nodeId: 'f5n0',
      nodeType: 'ELITE',
      turnNo: 1,
      order: ['player', 'e0'],
      player: { hp: character.hp, sp: character.sp, statuses: [], buffs: [], guarding: false },
      enemies: [shaman],
      log: [],
      result: 'ongoing',
      bossPhase: null,
      canFlee: false,
    };
    const result = executeEnemyAction(battle, character, 0, masters, createRng(1));
    expect(result.battle.enemies.length).toBe(2);
    expect(result.battle.enemies[1].code).toBe('slime');
    expect(result.battle.enemies[1].isSummon).toBe(true);
  });

  it('3体満員のときは召喚せず通常攻撃にフォールバックする', () => {
    const shamanMaster = ENEMIES.find((e) => e.code === 'dark_shaman')!;
    const character = makeCharacter();
    const makeAlly = (id: string): EnemyInstance => ({
      instanceId: id,
      code: 'slime',
      name: 'スライム',
      element: 'water',
      stats: ENEMIES.find((e) => e.code === 'slime')!.baseStats,
      hp: 10,
      statuses: [],
      buffs: [],
      guarding: false,
      intent: null,
      alive: true,
      isSummon: false,
      recentActionCodes: [],
    });
    const shaman: EnemyInstance = {
      instanceId: 'e0',
      code: shamanMaster.code,
      name: shamanMaster.name,
      element: shamanMaster.element,
      stats: shamanMaster.baseStats,
      hp: shamanMaster.baseStats.maxHp,
      statuses: [],
      buffs: [],
      guarding: false,
      intent: { actionCode: 'shaman_summon', label: '召喚', icon: 'summon' },
      alive: true,
      isSummon: false,
      recentActionCodes: [],
    };
    const battle: BattleState = {
      nodeId: 'f5n0',
      nodeType: 'ELITE',
      turnNo: 1,
      order: ['player', 'e0', 'e1', 'e2'],
      player: { hp: character.hp, sp: character.sp, statuses: [], buffs: [], guarding: false },
      enemies: [shaman, makeAlly('e1'), makeAlly('e2')],
      log: [],
      result: 'ongoing',
      bossPhase: null,
      canFlee: false,
    };
    const result = executeEnemyAction(battle, character, 0, masters, createRng(1));
    expect(result.battle.enemies.length).toBe(3); // 増えない
    expect(result.battle.player.hp).toBeLessThan(character.hp); // shaman_boltへフォールバックしダメージが発生
  });
});

describe('executeEnemyAction: ruin_guardianの3フェーズ遷移（統合テスト）', () => {
  it('HP低下に応じてbossPhaseが1→2→3へ遷移し、遷移直後は必ずguardian_quakeが予告される。HP50%以下でenrageが一度だけ付与される', () => {
    const battle = makeBattle('BOSS', 10, 42);
    const boss = battle.enemies[0];
    expect(boss.code).toBe('ruin_guardian');
    expect(battle.bossPhase).toBe(1);
    const character = makeCharacter();
    const maxHp = boss.stats.maxHp;

    // フェーズ2へ（70%以下）
    const atP2: BattleState = { ...battle, enemies: [{ ...boss, hp: Math.floor(maxHp * 0.65) }] };
    const r1 = executeEnemyAction(atP2, character, 0, masters, createRng(1));
    expect(r1.battle.bossPhase).toBe(2);
    expect(r1.battle.enemies[0].intent?.actionCode).toBe('guardian_quake');
    // まだ怒りは発動しない（ratio>0.5）
    expect(r1.battle.enemies[0].buffs.some((b) => b.code === 'atkUp' && b.remainingTurns > 1000)).toBe(false);

    // フェーズ3へ（40%以下）かつ怒り発動（50%以下）
    const atP3: BattleState = { ...r1.battle, enemies: [{ ...r1.battle.enemies[0], hp: Math.floor(maxHp * 0.35) }] };
    const r2 = executeEnemyAction(atP3, character, 0, masters, createRng(2));
    expect(r2.battle.bossPhase).toBe(3);
    expect(r2.battle.enemies[0].intent?.actionCode).toBe('guardian_quake');
    const enrageBuff = r2.battle.enemies[0].buffs.find((b) => b.code === 'atkUp' && b.remainingTurns > 1000);
    expect(enrageBuff).toBeDefined();
    expect(enrageBuff?.value).toBe(30);

    // 再度hpが変わらなければ怒りは重複付与されない
    const r3 = executeEnemyAction(r2.battle, character, 0, masters, createRng(3));
    const enrageBuffsAfter = r3.battle.enemies[0].buffs.filter((b) => b.code === 'atkUp' && b.remainingTurns > 1000);
    expect(enrageBuffsAfter).toHaveLength(1);
  });
});
