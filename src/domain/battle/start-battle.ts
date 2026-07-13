// 戦闘開始（docs/20 §2.6 startBattle）。
// 敵編成・階層補正は本タスクの実装指示に基づく簡略化版
// （docs/19 §8の詳細な体数別確率テーブルではなく、指示された単純ルールを採用。差異は最終報告に記載）。
import type { EnemyMaster, NodeTypeCode } from '@/constants/masters/types';
import type { RunCharacter } from '@/domain/dungeon/run-state';
import type { Rng } from '@/domain/shared/rng';

import { selectEnemyAction, type EnemyActionContext } from '../enemy/select-action';
import { determineTurnOrder } from './turn-order';
import type { BattleState, CombatStats, EnemyInstance } from './types';

export class BattleSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleSetupError';
  }
}

type SpawnRole = 'normal' | 'strong' | 'elite' | 'boss';

/** 種別補正（HP/ATKのみ。docs/19 §3・CORE_SPEC §5.4） */
const TYPE_HP_ATK_MULT: Record<SpawnRole, { hp: number; atk: number }> = {
  normal: { hp: 1, atk: 1 },
  strong: { hp: 1.5, atk: 1.15 },
  elite: { hp: 2.0, atk: 1.3 },
  boss: { hp: 4.0, atk: 1.5 },
};

/**
 * 階層補正込みの実効ステータス算出。
 * stat(floor) = round(base × (1 + 0.12×(floor-1)) × difficultyStatMod)、HP/ATKはさらに種別補正を乗算。
 * 四捨五入方針（実装判断）: 階層補正とHP/ATK種別補正は2段階で個別にroundする。
 */
export function scaleStats(
  base: EnemyMaster['baseStats'],
  floor: number,
  difficultyStatMod: number,
  spawnRole: SpawnRole,
): CombatStats {
  const floorCoef = 1 + 0.12 * (floor - 1);
  const mult = TYPE_HP_ATK_MULT[spawnRole];
  const scale = (v: number): number => Math.round(v * floorCoef * difficultyStatMod);
  return {
    maxHp: Math.round(scale(base.maxHp) * mult.hp),
    atk: Math.round(scale(base.atk) * mult.atk),
    def: scale(base.def),
    spd: scale(base.spd),
    critRate: base.critRate,
    critDmg: base.critDmg,
    eva: base.eva,
    acc: base.acc,
    statusRes: base.statusRes,
  };
}

function poolForFloor(
  masters: readonly EnemyMaster[],
  floor: number,
  enemyType: EnemyMaster['enemyType'],
): EnemyMaster[] {
  return masters.filter(
    (m) => m.enemyType === enemyType && !m.isSummon && floor >= m.appearFloorMin && floor <= m.appearFloorMax,
  );
}

interface SpawnPlan {
  master: EnemyMaster;
  spawnRole: SpawnRole;
}

/**
 * 敵編成抽選（実装指示に基づく簡略ルール）:
 * BATTLE=1〜2体（rng.int(1,2)、階層1-3は1体固定）
 * STRONG=1体（強敵補正）+ 階層6以降50%で通常敵1体随伴
 * ELITE=1体（エリート補正。プールは該当階層のelite種別マスタ）
 * BOSS=ruin_guardian固定
 */
function buildSpawnPlan(
  nodeType: NodeTypeCode,
  floor: number,
  masters: readonly EnemyMaster[],
  rng: Rng,
): SpawnPlan[] {
  if (nodeType === 'BOSS') {
    const boss = masters.find((m) => m.enemyType === 'boss' && m.code === 'ruin_guardian');
    if (!boss) throw new BattleSetupError('ERR_INTERNAL: ruin_guardian not found in masters');
    return [{ master: boss, spawnRole: 'boss' }];
  }
  if (nodeType === 'ELITE') {
    const pool = poolForFloor(masters, floor, 'elite');
    if (pool.length === 0) throw new BattleSetupError(`ERR_INTERNAL: no elite enemy for floor ${floor}`);
    return [{ master: rng.pick(pool), spawnRole: 'elite' }];
  }
  if (nodeType === 'STRONG') {
    const pool = poolForFloor(masters, floor, 'normal');
    if (pool.length === 0) throw new BattleSetupError(`ERR_INTERNAL: no normal enemy for floor ${floor}`);
    const plan: SpawnPlan[] = [{ master: rng.pick(pool), spawnRole: 'strong' }];
    if (floor >= 6 && rng.next() < 0.5) {
      plan.push({ master: rng.pick(pool), spawnRole: 'normal' });
    }
    return plan;
  }
  // BATTLE（既定）
  const pool = poolForFloor(masters, floor, 'normal');
  if (pool.length === 0) throw new BattleSetupError(`ERR_INTERNAL: no normal enemy for floor ${floor}`);
  const count = floor <= 3 ? 1 : rng.int(1, 2);
  return Array.from({ length: count }, () => ({ master: rng.pick(pool), spawnRole: 'normal' as const }));
}

export interface StartBattleParams {
  nodeId: string;
  nodeType: NodeTypeCode;
  floor: number;
  character: RunCharacter;
  difficultyStatMod: number;
  masters: { enemies: readonly EnemyMaster[] };
  rng: Rng;
}

export function startBattle(params: StartBattleParams): BattleState {
  const { nodeId, nodeType, floor, character, difficultyStatMod, masters, rng } = params;

  const plan = buildSpawnPlan(nodeType, floor, masters.enemies, rng);
  const enemies: EnemyInstance[] = plan.map((p, index) => ({
    instanceId: `e${index}`,
    code: p.master.code,
    name: p.master.name,
    element: p.master.element,
    stats: scaleStats(p.master.baseStats, floor, difficultyStatMod, p.spawnRole),
    hp: 0, // 直後に設定
    statuses: [],
    buffs: [],
    guarding: false,
    intent: null,
    alive: true,
    isSummon: false,
    recentActionCodes: [],
  }));
  for (const e of enemies) e.hp = e.stats.maxHp;

  const bossPhase: 1 | 2 | 3 | null = nodeType === 'BOSS' ? 1 : null;
  const playerHpPct = character.stats.maxHp > 0 ? character.hp / character.stats.maxHp : 0;

  const allyBuffCheck = (code: string): boolean => enemies.every((e) => e.buffs.some((b) => b.code === code));
  const context: EnemyActionContext = {
    turnNo: 1,
    bossPhase,
    aliveEnemyCount: enemies.length,
    playerHpPct,
    playerStatusCodes: [],
    alliesAllHaveBuff: allyBuffCheck,
    phaseShiftPending: false,
    turnsInCurrentPhase: 0,
  };

  for (const enemy of enemies) {
    const master = masters.enemies.find((m) => m.code === enemy.code);
    if (!master) throw new BattleSetupError(`ERR_INTERNAL: master not found for ${enemy.code}`);
    enemy.intent = selectEnemyAction(enemy, master.aiRules, master.actions, context, rng);
  }

  const order = determineTurnOrder([
    { id: 'player', spd: character.stats.spd, alive: true },
    ...enemies.map((e, i) => ({ id: `e${i}`, spd: e.stats.spd, alive: e.alive })),
  ]);

  return {
    nodeId,
    nodeType,
    turnNo: 1,
    order,
    player: { hp: character.hp, sp: character.sp, statuses: [], buffs: [], guarding: false },
    enemies,
    log: [],
    result: 'ongoing',
    bossPhase,
    canFlee: nodeType !== 'BOSS' && nodeType !== 'ELITE',
  };
}
