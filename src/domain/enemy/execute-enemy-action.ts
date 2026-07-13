// 敵1体の行動解決（docs/20 §2.15）。表示済みintentをそのまま実行し、実行後に次intentを再抽選する。
//
// 実装判断（docs未記載分）:
// - phaseShiftPending/turnsInCurrentPhaseはBattleState/EnemyInstanceスキーマに永続カウンタが無いため、
//   phaseShiftPendingはこの関数内でフェーズ変化を検出してその場で使い切る（永続化不要で成立）。
//   turnsInCurrentPhaseは正確な「フェーズ突入後の経過ターン」を保持する領域が無いため、
//   簡略化としてbattle.turnNoをそのまま渡している（P3の「3ターンごと」は近似）。
// - enrage（怒り、atk+30%・解除不能・バフ枠外）はEnemyInstanceに専用フィールドが無いため、
//   remainingTurns を極端に大きい値にしたatkUpバフとして表現し、二重付与を防止する。
// - 召喚スライムのステータス計算にはfloor（階層）が必要だが、executeEnemyActionの引数にfloorは無いため、
//   battle.nodeId（'f{floor}n{index}'形式）から復元する。difficultyStatModはMVPがNormal固定（=1.0）なので1を使用する。
import type { EnemyActionDef, EnemyMaster } from '@/constants/masters/types';
import type { RunCharacter } from '@/domain/dungeon/run-state';
import type { Rng } from '@/domain/shared/rng';
import type { EffectType } from '@/domain/skill/effect-params';

import {
  applyEffectResult,
  enemyToActorCtx,
  enemyToTargetCtx,
  makeLog,
  makeTargetCtx,
  targetResultToLog,
} from '../battle/effective-ctx';
import { applyBuff } from '../battle/modifiers';
import { resolveEffect, type EffectTargetCtx } from '../battle/skill-effects';
import { isIncapacitated } from '../battle/status-effects';
import { scaleStats } from '../battle/start-battle';
import type { ActionLogEntry, BattleState, EnemyInstance } from '../battle/types';
import { selectEnemyAction, type EnemyActionContext } from './select-action';

export interface ExecuteEnemyActionResult {
  battle: BattleState;
  character: RunCharacter;
  logs: ActionLogEntry[];
}

const ENRAGE_MARKER_TURNS = 999_999;
const MAX_ENEMY_SLOTS = 3;

function mustFindEnemy(battle: BattleState, actorId: string): EnemyInstance {
  const enemy = battle.enemies.find((e) => e.instanceId === actorId);
  if (!enemy) throw new Error(`ERR_INTERNAL: enemy ${actorId} not found`);
  return enemy;
}

function setEnemyGuarding(battle: BattleState, actorId: string, guarding: boolean): BattleState {
  return {
    ...battle,
    enemies: battle.enemies.map((e) => (e.instanceId === actorId ? { ...e, guarding } : e)),
  };
}

function setEnemyIntent(battle: BattleState, actorId: string, intent: EnemyInstance['intent']): BattleState {
  return {
    ...battle,
    enemies: battle.enemies.map((e) => (e.instanceId === actorId ? { ...e, intent } : e)),
  };
}

function recordRecentAction(battle: BattleState, actorId: string, actionCode: string): BattleState {
  return {
    ...battle,
    enemies: battle.enemies.map((e) =>
      e.instanceId === actorId ? { ...e, recentActionCodes: [actionCode, ...e.recentActionCodes].slice(0, 5) } : e,
    ),
  };
}

function parseFloorFromNodeId(nodeId: string): number {
  const m = /^f(\d+)n\d+$/.exec(nodeId);
  return m ? Number(m[1]) : 1;
}

function findBaseAttackAction(actions: readonly EnemyActionDef[]): EnemyActionDef | undefined {
  return actions.find((a) => a.intentIcon === 'attack');
}

/** DEC-036: 対象死亡・HP全快でのheal・満員でのsummon 等の無効化フォールバック判定 */
function needsFallback(actionDef: EnemyActionDef, enemy: EnemyInstance, battle: BattleState): boolean {
  for (const effect of actionDef.effects) {
    if (effect.effectType === 'heal') {
      const target = (effect.params as { target?: string }).target;
      if ((target === 'self' || target === undefined) && enemy.hp >= enemy.stats.maxHp) return true;
    }
    if (effect.effectType === 'summon') {
      const aliveCount = battle.enemies.filter((e) => e.alive).length;
      if (aliveCount >= MAX_ENEMY_SLOTS) return true;
    }
  }
  return false;
}

function resolveEnemyEffectTargets(
  effectType: string,
  rawParams: Record<string, unknown>,
  battle: BattleState,
  character: RunCharacter,
  enemy: EnemyInstance,
): EffectTargetCtx[] {
  const targetKey = (rawParams as { target?: string }).target;
  const selfCtx = (): EffectTargetCtx => enemyToTargetCtx(enemy);
  const playerCtx = (): EffectTargetCtx =>
    makeTargetCtx(
      'player',
      'none',
      battle.player.hp,
      character.stats,
      battle.player.buffs,
      battle.player.statuses,
      battle.player.guarding,
    );
  const allyAllCtx = (): EffectTargetCtx[] => battle.enemies.filter((e) => e.alive).map(enemyToTargetCtx);

  switch (effectType) {
    case 'lifesteal':
    case 'sp_gain':
    case 'shield':
    case 'revive_guard':
    case 'cleanse':
    case 'stat_passive':
    case 'counter':
      return effectType === 'lifesteal' ? [] : [selfCtx()];
    case 'heal':
      return targetKey === 'self' || targetKey === undefined ? [selfCtx()] : [playerCtx()];
    case 'buff':
      return targetKey === 'allyAll' ? allyAllCtx() : [selfCtx()];
    default:
      // damage / damage_aoe / status / debuff は敵からプレイヤーへの敵対行動
      return [playerCtx()];
  }
}

function spawnSummonInstance(master: EnemyMaster, floor: number, index: number): EnemyInstance {
  const stats = scaleStats(master.baseStats, floor, 1, 'normal');
  return {
    instanceId: `e${index}`,
    code: master.code,
    name: master.name,
    element: master.element,
    stats,
    hp: stats.maxHp,
    statuses: [],
    buffs: [],
    guarding: false,
    intent: null, // 召喚ターンは行動キューに入らない。次ターン終了処理でintent付与（docs/19実装注意5）
    alive: true,
    isSummon: true,
    recentActionCodes: [],
  };
}

function updateBossPhase(battle: BattleState, actorId: string): BattleState {
  const boss = mustFindEnemy(battle, actorId);
  if (!boss.alive) return battle;
  const ratio = boss.hp / boss.stats.maxHp;
  const newPhase: 1 | 2 | 3 = ratio > 0.7 ? 1 : ratio > 0.4 ? 2 : 3;

  const alreadyEnraged = boss.buffs.some((b) => b.code === 'atkUp' && b.remainingTurns >= ENRAGE_MARKER_TURNS);
  let enemies = battle.enemies;
  if (ratio <= 0.5 && !alreadyEnraged) {
    enemies = enemies.map((e) =>
      e.instanceId === actorId
        ? { ...e, buffs: applyBuff(e.buffs, { code: 'atkUp', value: 30, remainingTurns: ENRAGE_MARKER_TURNS }) }
        : e,
    );
  }
  return { ...battle, enemies, bossPhase: newPhase };
}

export function executeEnemyAction(
  battle: BattleState,
  character: RunCharacter,
  enemyIndex: number,
  masters: { enemies: readonly EnemyMaster[] },
  rng: Rng,
): ExecuteEnemyActionResult {
  const enemy = battle.enemies[enemyIndex];
  if (!enemy) throw new Error(`ERR_INTERNAL: enemy not found at index ${enemyIndex}`);
  const actorId = enemy.instanceId;
  if (!enemy.alive) return { battle, character, logs: [] };

  const master = masters.enemies.find((m) => m.code === enemy.code);
  if (!master) throw new Error(`ERR_INTERNAL: master not found for enemy ${enemy.code}`);

  // 行動不能判定（stun/paralysis）。intentは消化されず維持（予告詐欺防止。docs/19 §2.3-4）
  if (isIncapacitated(enemy.statuses, rng)) {
    const log = makeLog(battle, actorId, 'enemy_action', { note: 'incapacitated' });
    return { battle: { ...battle, log: [...battle.log, log] }, character, logs: [log] };
  }

  if (!enemy.intent) throw new Error(`ERR_INTERNAL: enemy ${actorId} has no intent`);
  let actionDef = master.actions.find((a) => a.code === enemy.intent?.actionCode);
  if (!actionDef) throw new Error(`ERR_INTERNAL: action ${enemy.intent.actionCode} not found`);

  if (needsFallback(actionDef, enemy, battle)) {
    const base = findBaseAttackAction(master.actions);
    if (!base) throw new Error(`ERR_INTERNAL: no base attack action for ${enemy.code}`);
    actionDef = base;
  }

  let curBattle = battle;
  let curCharacter = character;
  const logs: ActionLogEntry[] = [];
  let previousDamage: number | undefined;

  for (const effect of actionDef.effects) {
    if (effect.effectType === 'guard') {
      const params = effect.params as { damageCutPct: number };
      curBattle = setEnemyGuarding(curBattle, actorId, true);
      logs.push(
        makeLog(curBattle, actorId, 'enemy_action', {
          detailCode: actionDef.code,
          note: `guard:${params.damageCutPct}`,
        }),
      );
      continue;
    }
    if (effect.effectType === 'summon') {
      const params = effect.params as { enemyCode: string; count: number };
      const aliveCount = curBattle.enemies.filter((e) => e.alive).length;
      const capacity = Math.max(0, MAX_ENEMY_SLOTS - aliveCount);
      const spawnCount = Math.min(params.count, capacity);
      const floor = parseFloorFromNodeId(curBattle.nodeId);
      const summonMaster = masters.enemies.find((m) => m.code === params.enemyCode);
      const spawned: EnemyInstance[] = [];
      if (summonMaster) {
        for (let i = 0; i < spawnCount; i += 1) {
          spawned.push(spawnSummonInstance(summonMaster, floor, curBattle.enemies.length + spawned.length));
        }
      }
      curBattle = { ...curBattle, enemies: [...curBattle.enemies, ...spawned] };
      logs.push(
        makeLog(curBattle, actorId, 'enemy_action', { detailCode: actionDef.code, note: `summon:${spawnCount}` }),
      );
      continue;
    }

    const enemyNow = mustFindEnemy(curBattle, actorId);
    const actorCtx = enemyToActorCtx(enemyNow);
    const targets = resolveEnemyEffectTargets(effect.effectType, effect.params, curBattle, curCharacter, enemyNow);
    if (targets.length === 0 && effect.effectType !== 'lifesteal') continue;

    const result = resolveEffect(effect.effectType as EffectType, effect.params, {
      actor: actorCtx,
      targets,
      rng,
      previousDamage,
    });
    const applied = applyEffectResult(curBattle, curCharacter, actorId, result);
    curBattle = applied.battle;
    curCharacter = applied.character;
    previousDamage = result.damageDealt;

    for (const tr of result.targetResults) {
      logs.push(targetResultToLog(curBattle, actorId, 'enemy_action', actionDef.code, tr));
    }
  }

  curBattle = recordRecentAction(curBattle, actorId, actionDef.code);

  const bossPhaseBefore = curBattle.bossPhase;
  if (master.enemyType === 'boss') {
    curBattle = updateBossPhase(curBattle, actorId);
  }

  const enemyAfter = mustFindEnemy(curBattle, actorId);
  const aliveCount = curBattle.enemies.filter((e) => e.alive).length;
  const playerHpPct = curCharacter.stats.maxHp > 0 ? curBattle.player.hp / curCharacter.stats.maxHp : 0;
  const phaseShiftPending = master.enemyType === 'boss' && curBattle.bossPhase !== bossPhaseBefore;

  const context: EnemyActionContext = {
    turnNo: curBattle.turnNo + 1,
    bossPhase: curBattle.bossPhase,
    aliveEnemyCount: aliveCount,
    playerHpPct,
    playerStatusCodes: curBattle.player.statuses.map((s) => s.code),
    alliesAllHaveBuff: (code) =>
      curBattle.enemies.filter((e) => e.alive).every((e) => e.buffs.some((b) => b.code === code)),
    phaseShiftPending,
    turnsInCurrentPhase: curBattle.turnNo,
  };

  const nextIntent = enemyAfter.alive
    ? selectEnemyAction(enemyAfter, master.aiRules, master.actions, context, rng)
    : null;
  curBattle = setEnemyIntent(curBattle, actorId, nextIntent);

  return { battle: curBattle, character: curCharacter, logs };
}
