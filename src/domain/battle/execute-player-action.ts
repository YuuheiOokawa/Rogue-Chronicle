// プレイヤー行動の解決（docs/20 §2.14★詳細）。
//
// 実装判断（signatureの拡張）: 本タスクの指示では
// `executePlayerAction(battle, character, skills: SkillMaster[], action, rng)` と与えられているが、
// skillCodeの所持判定・スキル強化Lvによるレベルスケーリング適用にはRunState.skills（code+level）が
// 必須であり、SkillMaster[]（マスタ全件）だけでは実装不可能なため、所持スキル一覧
// （ownedSkills: RunState.skillsそのままの形）を引数として追加している。
import { CONSUMABLES_BY_CODE } from '@/constants/items';
import type { SkillEffectDef, SkillMaster } from '@/constants/masters/types';
import type { RunCharacter } from '@/domain/dungeon/run-state';
import type { Rng } from '@/domain/shared/rng';

import {
  applyEffectResult,
  enemyToTargetCtx,
  makeActorCtx,
  makeLog,
  makeTargetCtx,
  targetResultToLog,
} from './effective-ctx';
import { effectiveSpd } from './modifiers';
import { resolveEffect, type EffectTargetCtx } from './skill-effects';
import { isIncapacitated } from './status-effects';
import type { ActionLogEntry, BattleState, EnemyInstance } from './types';

export class InvalidBattleActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBattleActionError';
  }
}

export type PlayerAction =
  | { type: 'attack'; targetId: string }
  | { type: 'skill'; skillCode: string; targetId?: string }
  | { type: 'guard' }
  | { type: 'item'; itemCode: string; targetId?: string }
  | { type: 'flee' };

export interface OwnedSkill {
  code: string;
  level: number;
}

export interface ExecutePlayerActionResult {
  battle: BattleState;
  character: RunCharacter;
  logs: ActionLogEntry[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findAliveEnemy(battle: BattleState, targetId: string | undefined): EnemyInstance {
  const enemy = battle.enemies.find((e) => e.instanceId === targetId);
  if (!enemy || !enemy.alive) {
    throw new InvalidBattleActionError(`invalid or dead target: ${String(targetId)}`);
  }
  return enemy;
}

/** levelScaling適用後の有効params。unlockAtLevel未達はnull（このeffectはスキップ） */
function resolveLeveledParams(effectDef: SkillEffectDef, level: number): Record<string, unknown> | null {
  const scaling = effectDef.levelScaling;
  if (scaling?.unlockAtLevel !== undefined && level < scaling.unlockAtLevel) return null;
  const override = scaling?.byLevel?.[String(level)];
  return { ...effectDef.params, ...(override ?? {}) };
}

function resolveTargetCtxs(
  targetType: SkillMaster['targetType'],
  battle: BattleState,
  character: RunCharacter,
  targetId: string | undefined,
): EffectTargetCtx[] {
  if (targetType === 'self') {
    return [
      makeTargetCtx(
        'player',
        'none',
        battle.player.hp,
        character.stats,
        battle.player.buffs,
        battle.player.statuses,
        battle.player.guarding,
      ),
    ];
  }
  if (targetType === 'enemy_all') {
    return battle.enemies.filter((e) => e.alive).map(enemyToTargetCtx);
  }
  return [enemyToTargetCtx(findAliveEnemy(battle, targetId))];
}

export function executePlayerAction(
  battle: BattleState,
  character: RunCharacter,
  ownedSkills: readonly OwnedSkill[],
  skillMasters: readonly SkillMaster[],
  action: PlayerAction,
  rng: Rng,
): ExecutePlayerActionResult {
  if (battle.result !== 'ongoing') {
    throw new InvalidBattleActionError(`battle is not ongoing (result=${battle.result})`);
  }

  const hadStun = battle.player.statuses.some((s) => s.code === 'stun');
  if (isIncapacitated(battle.player.statuses, rng)) {
    const statuses = hadStun ? battle.player.statuses.filter((s) => s.code !== 'stun') : battle.player.statuses;
    const nextBattle: BattleState = { ...battle, player: { ...battle.player, statuses } };
    const log = makeLog(nextBattle, 'player', action.type === 'skill' ? 'skill' : action.type, {
      note: 'incapacitated',
    });
    return { battle: { ...nextBattle, log: [...nextBattle.log, log] }, character, logs: [log] };
  }

  switch (action.type) {
    case 'attack':
      return doAttack(battle, character, action, rng);
    case 'skill':
      return doSkill(battle, character, ownedSkills, skillMasters, action, rng);
    case 'guard':
      return doGuard(battle, character);
    case 'item':
      return doItem(battle, character, action);
    case 'flee':
      return doFlee(battle, character, rng);
  }
}

function doAttack(
  battle: BattleState,
  character: RunCharacter,
  action: { type: 'attack'; targetId: string },
  rng: Rng,
): ExecutePlayerActionResult {
  const target = findAliveEnemy(battle, action.targetId);
  const actorCtx = makeActorCtx('player', 'none', character.stats, battle.player.buffs, battle.player.statuses);
  const targetCtx = enemyToTargetCtx(target);
  const result = resolveEffect('damage', { mult: 1.0 }, { actor: actorCtx, targets: [targetCtx], rng });

  const applied = applyEffectResult(battle, character, 'player', result);
  // 通常攻撃は命中・回避に関わらずSP+1（docs/16 §3.1 DEC-031）
  const sp = Math.min(applied.character.maxSp, applied.character.sp + 1);
  const character2 = { ...applied.character, sp };
  const battle2: BattleState = { ...applied.battle, player: { ...applied.battle.player, sp } };

  const tr = result.targetResults[0];
  const log = targetResultToLog(battle2, 'player', 'attack', undefined, tr);
  const battle3 = { ...battle2, log: [...battle2.log, log] };
  return { battle: battle3, character: character2, logs: [log] };
}

function doSkill(
  battle: BattleState,
  character: RunCharacter,
  ownedSkills: readonly OwnedSkill[],
  skillMasters: readonly SkillMaster[],
  action: { type: 'skill'; skillCode: string; targetId?: string },
  rng: Rng,
): ExecutePlayerActionResult {
  const owned = ownedSkills.find((s) => s.code === action.skillCode);
  if (!owned) throw new InvalidBattleActionError(`skill not owned: ${action.skillCode}`);
  const master = skillMasters.find((s) => s.code === action.skillCode);
  if (!master) throw new InvalidBattleActionError(`unknown skill master: ${action.skillCode}`);
  if (character.sp < master.spCost) throw new InvalidBattleActionError('SP不足');

  let curCharacter: RunCharacter = { ...character, sp: character.sp - master.spCost };
  let curBattle: BattleState = { ...battle, player: { ...battle.player, sp: curCharacter.sp } };

  let previousDamage: number | undefined;
  const logs: ActionLogEntry[] = [];
  const orderedEffects = [...master.effects].sort((a, b) => a.order - b.order);

  for (const effectDef of orderedEffects) {
    const params = resolveLeveledParams(effectDef, owned.level);
    if (params === null) continue; // unlockAtLevel未達

    const actorCtx = makeActorCtx('player', master.element, curCharacter.stats, curBattle.player.buffs, curBattle.player.statuses);
    const targets = resolveTargetCtxs(master.targetType, curBattle, curCharacter, action.targetId);
    if (targets.length === 0) continue;

    const result = resolveEffect(effectDef.effectType, params, {
      actor: actorCtx,
      targets,
      rng,
      previousDamage,
    });
    const applied = applyEffectResult(curBattle, curCharacter, 'player', result);
    curBattle = applied.battle;
    curCharacter = applied.character;
    previousDamage = result.damageDealt;

    for (const tr of result.targetResults) {
      logs.push(targetResultToLog(curBattle, 'player', 'skill', master.code, tr));
    }
    if (result.actorHpDelta !== undefined || result.actorSpDelta !== undefined || result.actorBuffApplied) {
      logs.push(makeLog(curBattle, 'player', 'skill', { detailCode: master.code, note: result.note }));
    }
  }

  curBattle = { ...curBattle, log: [...curBattle.log, ...logs] };
  return { battle: curBattle, character: curCharacter, logs };
}

function doGuard(battle: BattleState, character: RunCharacter): ExecutePlayerActionResult {
  const sp = Math.min(character.maxSp, character.sp + 2);
  const character2 = { ...character, sp };
  const battle2: BattleState = { ...battle, player: { ...battle.player, guarding: true, sp } };
  const log = makeLog(battle2, 'player', 'guard', {});
  const battle3 = { ...battle2, log: [...battle2.log, log] };
  return { battle: battle3, character: character2, logs: [log] };
}

/** Phase6ではポーション（itemCode='potion'）のみ実装。効果量はsrc/constants/items.tsの定義を正とする */
function doItem(
  battle: BattleState,
  character: RunCharacter,
  action: { type: 'item'; itemCode: string; targetId?: string },
): ExecutePlayerActionResult {
  if (action.itemCode !== 'potion') {
    throw new InvalidBattleActionError(`unsupported item in Phase6: ${action.itemCode}`);
  }
  const item = CONSUMABLES_BY_CODE.potion;
  if (item.effect.type !== 'heal') {
    throw new InvalidBattleActionError('potion effect misconfigured');
  }
  const healed = Math.floor((character.stats.maxHp * item.effect.hpPctOfMax) / 100);
  const newHp = Math.min(character.stats.maxHp, character.hp + healed);
  const character2 = { ...character, hp: newHp };
  const battle2: BattleState = { ...battle, player: { ...battle.player, hp: newHp } };
  const log = makeLog(battle2, 'player', 'item', {
    detailCode: 'potion',
    healed: newHp - character.hp,
  });
  const battle3 = { ...battle2, log: [...battle2.log, log] };
  return { battle: battle3, character: character2, logs: [log] };
}

function doFlee(battle: BattleState, character: RunCharacter, rng: Rng): ExecutePlayerActionResult {
  if (!battle.canFlee) {
    throw new InvalidBattleActionError('flee not allowed (BOSS/ELITE)');
  }
  const aliveEnemies = battle.enemies.filter((e) => e.alive);
  const maxEnemySpd = Math.max(...aliveEnemies.map((e) => effectiveSpd(e.stats, e.buffs)));
  const playerSpd = effectiveSpd(character.stats, battle.player.buffs);
  const successRate = clamp(50 + (playerSpd - maxEnemySpd) * 2, 20, 90);
  const success = rng.next() * 100 < successRate;

  if (success) {
    const battle2: BattleState = { ...battle, result: 'fled' };
    const log = makeLog(battle2, 'player', 'flee', { note: 'fled_success' });
    const battle3 = { ...battle2, log: [...battle2.log, log] };
    return { battle: battle3, character, logs: [log] };
  }
  const log = makeLog(battle, 'player', 'flee', { note: 'flee_failed' });
  const battle2 = { ...battle, log: [...battle.log, log] };
  return { battle: battle2, character, logs: [log] };
}
