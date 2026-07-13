import { describe, expect, it } from 'vitest';

import { ENEMIES } from '@/constants/masters/enemies';
import type { EnemyAiRuleDef } from '@/constants/masters/types';
import { createRng } from '@/domain/shared/rng';

import type { EnemyInstance } from '../battle/types';
import { selectEnemyAction, type EnemyActionContext } from './select-action';

const goblin = ENEMIES.find((e) => e.code === 'goblin')!;
const orcChampion = ENEMIES.find((e) => e.code === 'orc_champion')!;

function makeEnemy(master: typeof goblin, overrides: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    instanceId: 'e0',
    code: master.code,
    name: master.name,
    element: master.element,
    stats: master.baseStats,
    hp: master.baseStats.maxHp,
    statuses: [],
    buffs: [],
    guarding: false,
    intent: null,
    alive: true,
    isSummon: false,
    recentActionCodes: [],
    ...overrides,
  };
}

const baseContext: EnemyActionContext = {
  turnNo: 1,
  bossPhase: null,
  aliveEnemyCount: 1,
  playerHpPct: 1,
};

describe('selectEnemyAction', () => {
  it('priority優先: 条件に合致する最小priorityの群から選ばれる', () => {
    const enemy = makeEnemy(goblin);
    const rng = createRng(1);
    const intent = selectEnemyAction(enemy, goblin.aiRules, goblin.actions, {
      ...baseContext,
      playerHpPct: 0.3, // playerHpBelow:0.35に合致 → priority10のgoblin_smashが必ず選ばれる
    }, rng);
    expect(intent.actionCode).toBe('goblin_smash');
  });

  it('条件不一致なら基本重みテーブル（priority=100・conditions=null）から抽選する', () => {
    const enemy = makeEnemy(goblin);
    const rng = createRng(1);
    const intent = selectEnemyAction(enemy, goblin.aiRules, goblin.actions, baseContext, rng);
    expect(['goblin_slash', 'goblin_smash']).toContain(intent.actionCode);
  });

  it('未知の条件キーはfalse扱いとなる（前方互換）', () => {
    const enemy = makeEnemy(goblin);
    const customRules: EnemyAiRuleDef[] = [
      { priority: 1, bossPhase: null, conditions: { unknownKey: true } as never, actionCode: 'goblin_smash', weight: 100 },
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'goblin_slash', weight: 100 },
    ];
    const intent = selectEnemyAction(enemy, customRules, goblin.actions, baseContext, createRng(1));
    expect(intent.actionCode).toBe('goblin_slash'); // 未知キーは合致しないため基本テーブルへフォールバック
  });

  it('同一行動3連続は禁止され、候補が他にあれば回避される', () => {
    const enemy = makeEnemy(goblin, { recentActionCodes: ['goblin_slash', 'goblin_slash'] });
    // 基本テーブルはslash70/smash30。slashを除外してもsmashが残るため必ずsmashが選ばれる
    for (let seed = 1; seed <= 20; seed += 1) {
      const intent = selectEnemyAction(enemy, goblin.aiRules, goblin.actions, baseContext, createRng(seed));
      expect(intent.actionCode).toBe('goblin_smash');
    }
  });

  it('3連続制限により候補が空になる場合は制限を無視する', () => {
    // 常にslimeが選ばれるような単一候補ルールを用意し、3連続でも選ばれ続けることを確認
    const enemy = makeEnemy(goblin, { recentActionCodes: ['goblin_slash', 'goblin_slash'] });
    const onlySlashRules: EnemyAiRuleDef[] = [
      { priority: 100, bossPhase: null, conditions: null, actionCode: 'goblin_slash', weight: 100 },
    ];
    const intent = selectEnemyAction(enemy, onlySlashRules, goblin.actions, baseContext, createRng(1));
    expect(intent.actionCode).toBe('goblin_slash');
  });

  it('重みの分布が統計的に妥当（goblin基本テーブル slash70% / smash30%、1000回試行）', () => {
    const enemy = makeEnemy(goblin);
    const counts: Record<string, number> = { goblin_slash: 0, goblin_smash: 0 };
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i += 1) {
      const intent = selectEnemyAction(enemy, goblin.aiRules, goblin.actions, baseContext, rng);
      counts[intent.actionCode] += 1;
    }
    const slashRatio = counts.goblin_slash / 1000;
    expect(slashRatio).toBeGreaterThan(0.6);
    expect(slashRatio).toBeLessThan(0.8);
  });

  it('orc_championは偶数（実行される次ターン番号）で必ず強撃intentになる', () => {
    const enemy = makeEnemy(orcChampion);
    const intent = selectEnemyAction(enemy, orcChampion.aiRules, orcChampion.actions, {
      ...baseContext,
      turnNo: 2,
    }, createRng(1));
    expect(intent.actionCode).toBe('orc_mighty');
  });

  it('orc_championは奇数ターンでは強撃を選ばない', () => {
    const enemy = makeEnemy(orcChampion);
    for (let seed = 1; seed <= 10; seed += 1) {
      const intent = selectEnemyAction(enemy, orcChampion.aiRules, orcChampion.actions, {
        ...baseContext,
        turnNo: 3,
      }, createRng(seed));
      expect(intent.actionCode).not.toBe('orc_mighty');
    }
  });
});
