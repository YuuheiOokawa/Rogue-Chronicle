// executePlayerAction/executeEnemyActionで共用する「実効ステータス付きEffectContext構築」+
// 「EffectResultのbattle/character反映」ヘルパ（重複実装防止）。
import type { RunCharacter } from '@/domain/dungeon/run-state';

import { applyBuff } from './modifiers';
import type { EffectActorCtx, EffectResult, EffectTargetCtx, EffectTargetResult } from './skill-effects';
import {
  effectiveAcc,
  effectiveAtk,
  effectiveCritDmg,
  effectiveCritRate,
  effectiveDef,
  effectiveEva,
  effectiveSpd,
  effectiveStatusRes,
} from './modifiers';
import type { ActionLogEntry, BattleState, BuffInstance, CombatStats, Element, EnemyInstance, StatusInstance } from './types';

/** buffs/statusesを反映した実効CombatStatsを算出する */
export function effectiveCombatStats(
  stats: CombatStats,
  buffs: readonly BuffInstance[],
  statuses: readonly StatusInstance[],
): CombatStats {
  return {
    maxHp: stats.maxHp,
    atk: effectiveAtk(stats, buffs, statuses),
    def: effectiveDef(stats, buffs, statuses),
    spd: effectiveSpd(stats, buffs),
    critRate: effectiveCritRate(stats, buffs),
    critDmg: effectiveCritDmg(stats),
    eva: effectiveEva(stats),
    acc: effectiveAcc(stats),
    statusRes: effectiveStatusRes(stats),
  };
}

export function makeActorCtx(
  id: string,
  element: Element,
  stats: CombatStats,
  buffs: readonly BuffInstance[],
  statuses: readonly StatusInstance[],
): EffectActorCtx {
  return { id, element, stats: effectiveCombatStats(stats, buffs, statuses) };
}

/**
 * アクターを被対象（EffectTargetCtx）として表現する。
 * elemResはMVP時点で全アクターelemRes未実装のため常に0とする（docs/19 §3 DEC-050: 全敵elemResなし。
 * RunCharacter.statsにもelemResフィールドは存在しない）。
 */
export function makeTargetCtx(
  id: string,
  element: Element,
  hp: number,
  stats: CombatStats,
  buffs: readonly BuffInstance[],
  statuses: readonly StatusInstance[],
  guarding: boolean,
): EffectTargetCtx {
  return {
    id,
    hp,
    maxHp: stats.maxHp,
    element,
    elemRes: 0,
    stats: effectiveCombatStats(stats, buffs, statuses),
    statuses,
    buffs,
    guarding,
  };
}

export function enemyToTargetCtx(enemy: EnemyInstance): EffectTargetCtx {
  return makeTargetCtx(enemy.instanceId, enemy.element, enemy.hp, enemy.stats, enemy.buffs, enemy.statuses, enemy.guarding);
}

export function enemyToActorCtx(enemy: EnemyInstance): EffectActorCtx {
  return makeActorCtx(enemy.instanceId, enemy.element, enemy.stats, enemy.buffs, enemy.statuses);
}

export interface BattleAndCharacter {
  battle: BattleState;
  character: RunCharacter;
}

function clampHp(hp: number, maxHp: number): number {
  return Math.min(maxHp, Math.max(0, hp));
}

/** 1件のEffectTargetResultをbattle（player or enemies）へ反映する */
export function applyTargetResult(
  battle: BattleState,
  character: RunCharacter,
  tr: EffectTargetResult,
): BattleAndCharacter {
  if (tr.targetId === 'player') {
    const newHp = clampHp(battle.player.hp + tr.hpDelta, character.stats.maxHp);
    const statuses = tr.newStatuses ?? battle.player.statuses;
    const buffs = tr.buffApplied ? applyBuff(battle.player.buffs, tr.buffApplied) : battle.player.buffs;
    return {
      battle: { ...battle, player: { ...battle.player, hp: newHp, statuses, buffs } },
      character: { ...character, hp: newHp },
    };
  }
  const enemies = battle.enemies.map((e) => {
    if (e.instanceId !== tr.targetId) return e;
    const newHp = clampHp(e.hp + tr.hpDelta, e.stats.maxHp);
    const statuses = tr.newStatuses ?? e.statuses;
    const buffs = tr.buffApplied ? applyBuff(e.buffs, tr.buffApplied) : e.buffs;
    return { ...e, hp: newHp, statuses, buffs, alive: newHp > 0 };
  });
  return { battle: { ...battle, enemies }, character };
}

/**
 * EffectResult（targetResults + actor自身への変化）をbattle/characterへ反映する。
 * actorIdは'player'または'e{N}'（skill-effects.tsのEffectResultはactorHpDelta/actorSpDelta/
 * actorBuffAppliedとして自己反映分を分離して返すため、ここでactorId側にも適用する）。
 */
export function applyEffectResult(
  battle: BattleState,
  character: RunCharacter,
  actorId: string,
  result: EffectResult,
): BattleAndCharacter {
  let cur: BattleAndCharacter = { battle, character };
  for (const tr of result.targetResults) {
    cur = applyTargetResult(cur.battle, cur.character, tr);
  }

  const hasActorChange =
    result.actorHpDelta !== undefined || result.actorSpDelta !== undefined || result.actorBuffApplied !== undefined;
  if (!hasActorChange) return cur;

  if (actorId === 'player') {
    const newHp = result.actorHpDelta
      ? clampHp(cur.battle.player.hp + result.actorHpDelta, cur.character.stats.maxHp)
      : cur.battle.player.hp;
    const newSp = result.actorSpDelta
      ? Math.min(cur.character.maxSp, Math.max(0, cur.character.sp + result.actorSpDelta))
      : cur.character.sp;
    const buffs = result.actorBuffApplied
      ? applyBuff(cur.battle.player.buffs, result.actorBuffApplied)
      : cur.battle.player.buffs;
    return {
      battle: { ...cur.battle, player: { ...cur.battle.player, hp: newHp, buffs } },
      character: { ...cur.character, hp: newHp, sp: newSp },
    };
  }

  const enemies = cur.battle.enemies.map((e) => {
    if (e.instanceId !== actorId) return e;
    const newHp = result.actorHpDelta ? clampHp(e.hp + result.actorHpDelta, e.stats.maxHp) : e.hp;
    const buffs = result.actorBuffApplied ? applyBuff(e.buffs, result.actorBuffApplied) : e.buffs;
    return { ...e, hp: newHp, buffs, alive: newHp > 0 };
  });
  return { battle: { ...cur.battle, enemies }, character: cur.character };
}

// ---------------------------------------------------------------
// ActionLogEntry構築（executePlayerAction/executeEnemyAction共用）
// ---------------------------------------------------------------

export function buildHpAfter(battle: BattleState): Record<string, number> {
  const hp: Record<string, number> = { player: battle.player.hp };
  for (const e of battle.enemies) hp[e.instanceId] = e.hp;
  return hp;
}

export function makeLog(
  battle: BattleState,
  actorId: string,
  action: ActionLogEntry['action'],
  extra: Partial<ActionLogEntry>,
): ActionLogEntry {
  return { turnNo: battle.turnNo, actorId, action, hpAfter: buildHpAfter(battle), ...extra };
}

export function targetResultToLog(
  battle: BattleState,
  actorId: string,
  action: ActionLogEntry['action'],
  detailCode: string | undefined,
  tr: EffectTargetResult,
): ActionLogEntry {
  return makeLog(battle, actorId, action, {
    detailCode,
    targetId: tr.targetId,
    damage: !tr.isMiss && tr.hpDelta < 0 ? -tr.hpDelta : undefined,
    healed: !tr.isMiss && tr.hpDelta > 0 ? tr.hpDelta : undefined,
    isCrit: tr.isCrit,
    isMiss: tr.isMiss,
    statusApplied: tr.statusApplied?.applied ? tr.statusApplied.code : undefined,
    buffApplied: tr.buffApplied?.code,
  });
}
