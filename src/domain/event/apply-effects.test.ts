import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { ENEMIES } from '@/constants/masters/enemies';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { SKILLS } from '@/constants/masters/skills';
import { createInitialRunState, validateRunState, type RunState } from '@/domain/dungeon/run-state';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { ZERO_UPGRADE_BONUS } from '@/domain/progression/apply-upgrades';
import { createRng } from '@/domain/shared/rng';

import { applyEventEffects, type EventEffectMasters } from './apply-effects';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
const ironSword = EQUIPMENT.find((e) => e.code === 'iron_sword')!;
const config = DUNGEONS[0].generationConfig;

const masters: EventEffectMasters = {
  equipment: EQUIPMENT,
  relics: RELICS,
  skills: SKILLS,
  enemies: ENEMIES,
  rewardTables: REWARD_TABLES,
};

function makeState(): RunState {
  const seed = 42;
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, config, rng);
  const state = createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: ironSword, armor: null, accessory: null },
    rngCursor: rng.cursor,
    upgradeBonus: ZERO_UPGRADE_BONUS,
    startRelic: null,
  });
  // 階層3のノードへ進めておく（floor基準のeffect検証用）
  return { ...state, position: { ...state.position, floor: 3, nodeId: 'f3n1' } };
}

describe('applyEventEffects', () => {
  it('runStatModPct: atkが%変更される（floor丸め）', () => {
    const state = makeState();
    const before = state.character.stats.atk;
    const r = applyEventEffects(state, [{ type: 'runStatModPct', stat: 'atk', valuePct: 8 }], masters, createRng(1));
    expect(r.state.character.stats.atk).toBe(Math.floor(before * 1.08));
  });

  it('damageHpPct: 下限1でクランプされ戦闘外死亡しない', () => {
    const state = makeState();
    const r = applyEventEffects(state, [{ type: 'damageHpPct', pct: 500 }], masters, createRng(1));
    expect(r.state.character.hp).toBe(1);
  });

  it('healHpPct: maxHpを超えない', () => {
    const state = makeState();
    const hurt = { ...state, character: { ...state.character, hp: 1 } };
    const r = applyEventEffects(hurt, [{ type: 'healHpPct', pct: 1000 }], masters, createRng(1));
    expect(r.state.character.hp).toBe(hurt.character.stats.maxHp);
  });

  it('gold: 負の値でも0未満にならない', () => {
    const state = { ...makeState(), gold: 10 };
    const r = applyEventEffects(state, [{ type: 'gold', amount: -100 }], masters, createRng(1));
    expect(r.state.gold).toBe(0);
  });

  it('goldPctLoss: floor((gold*pct)/100)を減算する', () => {
    const state = { ...makeState(), gold: 100 };
    const r = applyEventEffects(state, [{ type: 'goldPctLoss', pct: 25 }], masters, createRng(1));
    expect(r.state.gold).toBe(75);
  });

  it('grantRelic: 未所持から追加され、encountered.relicsにも記録される', () => {
    const state = makeState();
    const r = applyEventEffects(state, [{ type: 'grantRelic' }], masters, createRng(5));
    expect(r.state.relics).toHaveLength(1);
    expect(r.state.encountered.relics).toEqual(r.state.relics);
  });

  it('grantEquipment: 対象スロットを上書きし、encountered.equipmentに記録される', () => {
    const state = makeState();
    const r = applyEventEffects(
      state,
      [{ type: 'grantEquipment', rarityWeights: { common: 100 } }],
      masters,
      createRng(2),
    );
    // Phase7: createInitialRunStateが初期装備（iron_sword）もencountered.equipmentへ
    // 種付けするようになったため（run-state.tsコメント参照）、変化したスロットから判定する。
    const changedSlot = (['weapon', 'armor', 'accessory'] as const).find(
      (slot) => r.state.equipment[slot] !== state.equipment[slot],
    )!;
    const grantedCode = r.state.equipment[changedSlot]!;
    const master = EQUIPMENT.find((e) => e.code === grantedCode)!;
    expect(master.rarity).toBe('common');
    expect(r.state.equipment[master.slot]).toBe(grantedCode);
    expect(r.state.encountered.equipment).toEqual(expect.arrayContaining(['iron_sword', grantedCode]));
  });

  it('grantConsumable: 上限5を超えた分は+10G換算される', () => {
    const state = { ...makeState(), items: [{ code: 'potion', count: 4 }], gold: 0 };
    const r = applyEventEffects(
      state,
      [{ type: 'grantConsumable', itemCode: 'potion', count: 3 }],
      masters,
      createRng(1),
    );
    const potion = r.state.items.find((i) => i.code === 'potion');
    expect(potion?.count).toBe(5);
    expect(r.state.gold).toBe(20); // 2個分オーバーフロー×10G
  });

  it('grantExpPerFloor: amountPerFloor×floorを返す（stateには反映しない）', () => {
    const state = makeState(); // floor=3
    const r = applyEventEffects(state, [{ type: 'grantExpPerFloor', amountPerFloor: 15 }], masters, createRng(1));
    expect(r.grantedExp).toBe(45);
    expect(r.state.character.exp).toBe(state.character.exp);
  });

  it('upgradeRandomSkill: 所持スキル1つがLv+1される', () => {
    const state = makeState();
    const before = state.skills.reduce((sum, s) => sum + s.level, 0);
    const r = applyEventEffects(state, [{ type: 'upgradeRandomSkill' }], masters, createRng(3));
    const after = r.state.skills.reduce((sum, s) => sum + s.level, 0);
    expect(after).toBe(before + 1);
  });

  it('startBattle(fixed): triggeredBattleが固定enemyCodesで構築され、bonusGoldが返る', () => {
    const state = makeState();
    const r = applyEventEffects(
      state,
      [{ type: 'startBattle', encounter: 'fixed', enemyCodes: ['goblin', 'goblin'], bonusGold: 40 }],
      masters,
      createRng(7),
    );
    expect(r.triggeredBattle).not.toBeNull();
    expect(r.triggeredBattle?.enemies.map((e) => e.code)).toEqual(['goblin', 'goblin']);
    expect(r.battleBonusGold).toBe(40);
    expect(r.state.encountered.enemies).toEqual(['goblin']);
  });

  it('startBattle(random_battle): triggeredBattleがnodeType=BATTLEで構築される', () => {
    const state = makeState();
    const r = applyEventEffects(
      state,
      [{ type: 'startBattle', encounter: 'random_battle' }],
      masters,
      createRng(11),
    );
    expect(r.triggeredBattle).not.toBeNull();
    expect(r.triggeredBattle?.nodeType).toBe('BATTLE');
    expect(r.triggeredBattle!.enemies.length).toBeGreaterThan(0);
  });

  it('treasureRoll: treasureResultが確定するがstate.pendingRewardは変更しない', () => {
    const state = makeState();
    const r = applyEventEffects(
      state,
      [{ type: 'treasureRoll', tableCode: 'rt_treasure_normal' }],
      masters,
      createRng(4),
    );
    expect(r.treasureResult).not.toBeNull();
    expect(r.treasureResult?.type).toBe('treasure');
    expect(r.state.pendingReward).toBeNull();
  });

  it('consumeItemOrHpPct: 所持していれば1個消費し、なければfallbackでHP減少（下限1）', () => {
    const withItem = { ...makeState(), items: [{ code: 'potion', count: 1 }] };
    const r1 = applyEventEffects(
      withItem,
      [{ type: 'consumeItemOrHpPct', itemCode: 'potion', fallbackHpCurrentPct: 15 }],
      masters,
      createRng(1),
    );
    expect(r1.state.items.find((i) => i.code === 'potion')).toBeUndefined();
    expect(r1.state.character.hp).toBe(withItem.character.hp);

    const withoutItem = { ...makeState(), items: [] };
    const r2 = applyEventEffects(
      withoutItem,
      [{ type: 'consumeItemOrHpPct', itemCode: 'potion', fallbackHpCurrentPct: 500 }],
      masters,
      createRng(1),
    );
    expect(r2.state.character.hp).toBe(1);
  });

  it('weakenNextBattle: nextBattleDebuffがweakenになる', () => {
    const state = makeState();
    const r = applyEventEffects(state, [{ type: 'weakenNextBattle' }], masters, createRng(1));
    expect(r.state.nextBattleDebuff).toBe('weaken');
  });

  it('複数effectを順に適用してもvalidateRunStateを通過する', () => {
    const state = makeState();
    const r = applyEventEffects(
      state,
      [
        { type: 'gold', amount: 50 },
        { type: 'healHpPct', pct: 10 },
      ],
      masters,
      createRng(1),
    );
    expect(() => validateRunState(r.state)).not.toThrow();
  });
});
