import { SKILLS } from '@/constants/masters/skills';
import { effectiveSpd } from '@/domain/battle/modifiers';
import type { BattleState, BuffInstance, EnemyIntent, StatusInstance } from '@/domain/battle/types';
import type { RunCharacter, RunState } from '@/domain/dungeon/run-state';

/**
 * battle状態のクライアント表示用View（docs/13 API-401・API-402 / docs/09 SCR-302）。
 * BattleState（domain/server内部表現）をそのまま返さず、演出・UIに必要な情報のみへ投影する。
 * seed/rngCursor・敵の内部AIテーブル（aiRules）等は含めない（docs/13 実装時の注意点）。
 *
 * 実装判断: docs/13 API-401サンプルのintent.estimated（推定ダメージ表示）はdomainの
 * EnemyIntent型（actionCode/label/iconのみ）に対応するフィールドが無いため含めない
 * （domain層は変更禁止のため、無い情報は投影しない。UIはlabelのみで表示する）。
 * 同様にdocsサンプルのbattle.phase（'player_input'等）もBattleStateに存在しないため省略する
 * （本アプリはターン制で常にプレイヤー入力待ち状態から開始するため実害はない）。
 */

export interface BattlePlayerSkillView {
  code: string;
  level: number;
  spCost: number;
  usable: boolean;
}

export interface BattlePlayerView {
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  statuses: StatusInstance[];
  buffs: BuffInstance[];
  guarding: boolean;
  skills: BattlePlayerSkillView[];
  items: RunState['items'];
}

export interface BattleEnemyView {
  id: string;
  code: string;
  name: string;
  element: string;
  hp: number;
  maxHp: number;
  statuses: StatusInstance[];
  buffs: BuffInstance[];
  guarding: boolean;
  intent: EnemyIntent | null;
  alive: boolean;
}

export interface BattleView {
  nodeId: string;
  nodeType: BattleState['nodeType'];
  turnNo: number;
  order: string[];
  result: BattleState['result'];
  bossPhase: 1 | 2 | 3 | null;
  canFlee: boolean;
  /** 逃走成功率(%)。canFlee=falseまたは敵全滅時はnull（docs/09 SCR-302表示項目） */
  fleeChance: number | null;
  player: BattlePlayerView;
  enemies: BattleEnemyView[];
}

/** 逃走成功率の表示用推定（実際の成否判定はexecutePlayerAction内のサーバーRngで行う。同一の式を使用） */
function estimateFleeChance(battle: BattleState, character: RunCharacter): number | null {
  if (!battle.canFlee) return null;
  const aliveEnemies = battle.enemies.filter((e) => e.alive);
  if (aliveEnemies.length === 0) return null;
  const maxEnemySpd = Math.max(...aliveEnemies.map((e) => effectiveSpd(e.stats, e.buffs)));
  const playerSpd = effectiveSpd(character.stats, battle.player.buffs);
  const rate = 50 + (playerSpd - maxEnemySpd) * 2;
  return Math.min(90, Math.max(20, rate));
}

export function toBattleView(
  battle: BattleState,
  character: RunCharacter,
  ownedSkills: RunState['skills'],
  items: RunState['items'],
): BattleView {
  return {
    nodeId: battle.nodeId,
    nodeType: battle.nodeType,
    turnNo: battle.turnNo,
    order: battle.order,
    result: battle.result,
    bossPhase: battle.bossPhase,
    canFlee: battle.canFlee,
    fleeChance: estimateFleeChance(battle, character),
    player: {
      hp: battle.player.hp,
      maxHp: character.stats.maxHp,
      sp: battle.player.sp,
      maxSp: character.maxSp,
      statuses: battle.player.statuses,
      buffs: battle.player.buffs,
      guarding: battle.player.guarding,
      skills: ownedSkills.map((owned) => {
        const master = SKILLS.find((s) => s.code === owned.code);
        const spCost = master?.spCost ?? 0;
        return { code: owned.code, level: owned.level, spCost, usable: battle.player.sp >= spCost };
      }),
      items,
    },
    enemies: battle.enemies.map((e) => ({
      id: e.instanceId,
      code: e.code,
      name: e.name,
      element: e.element,
      hp: e.hp,
      maxHp: e.stats.maxHp,
      statuses: e.statuses,
      buffs: e.buffs,
      guarding: e.guarding,
      intent: e.intent,
      alive: e.alive,
    })),
  };
}
