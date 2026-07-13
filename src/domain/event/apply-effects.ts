// イベント効果の適用（docs/20 §2.26 executeRandomEvent の「効果適用」部分 / docs/17 §6）。
//
// 【全体設計方針（実装指示のとおりコード冒頭に明記）】
// 1. スコープ: 本ファイルは「resolveEventOutcomeで確定した1つのoutcomeのeffects配列」を
//    RunStateへ適用する純粋関数のみを提供する。EVENT/BLESS/CURSEの選択肢提示・
//    HEAL/STORYの自動解決トリガー・pendingReward/position.phaseの遷移そのものは
//    呼び出し側（server/usecases、Stage2実装）の責務とし、本関数はそれらのphase/pendingReward
//    フィールドを一切書き換えない（stateの中でcharacter/gold/items/relics/equipment/skills/
//    nextBattleDebuff/encounteredのみを更新する）。
// 2. 戻り値は実装指示の `{ state, triggeredBattle }` を土台に、以下2点を追加する
//    （理由: 13種のeffectのうち startBattle と treasureRoll は「即座に別の状態へ遷移する」
//    種類の効果であり、この関数だけでは pendingReward/battle への反映まで完結できないため、
//    呼び出し側が反映できるよう解決済みの中間結果を返す）:
//    - `treasureResult`: treasureRoll効果で確定した宝箱内容（呼び出し側が
//      `state.pendingReward = {type:'treasure', ...treasureResult}` して phase='reward_pending' へ
//      遷移させることを想定。生成のみ行い、pendingRewardへの反映はしない）
//    - `battleBonusGold`: startBattle(encounter='fixed')のbonusGold（EV-10）。戦闘勝利は
//      この関数のスコープ外（battle/execute-player-action.ts側）で確定するため、呼び出し側が
//      勝利時の通常報酬にこの値を加算する運用とする
//    - `grantedExp`: grantExpPerFloor効果の算出値（amountPerFloor×floor）。EXP加算そのものは
//      Phase6のgainExperience（progression/experience.ts）を呼ぶ側の責務とし、本関数は算出のみ行う
//      （実装指示の「推奨」に従った設計）
// 3. HP関連effect（damageHpPct/loseHpCurrentPct/consumeItemOrHpPctのフォールバック分）は
//    いずれも「イベントで戦闘外死亡なし」の原則を徹底し、下限1でクランプする
//    （damageHpPctはtypes.tsコメントに明記、loseHpCurrentPct/consumeItemOrHpPctは明記が無いが
//    同一原則を安全側に適用する実装判断とし、ここに明記する）。
// 4. grantEquipment: 対象スロットの既存装備を無条件で上書きする設計とする（実装指示の2案のうち
//    「単純な方」。空きスロット優先・非空なら装備選択UIへ、という分岐は導入しない）。
// 5. startBattle(encounter='fixed')は既存のdomain/battle/start-battle.tsのstartBattle()が
//    「floor+nodeTypeからマスタ抽選する」設計のみで固定enemyCodesを受け付けないため、
//    本ファイル内でscaleStats/selectEnemyAction/determineTurnOrderを再利用し、
//    startBattle()と同一ロジックの簡易版（buildFixedBattle）を構築する
//    （domain/battle/**は変更禁止のため、既存のエクスポート関数を呼び出す形で再利用のみ行う）。
//    spawnRoleは常に'normal'とする（fixed encounterは現状ev_ambushのgoblin×2のみで妥当）。
// 6. weakenNextBattle: 本関数はrun_state.nextBattleDebuffへフラグを立てるのみで、実際の付与は
//    次回battle開始時（selectNextNode相当、変更禁止領域）側の責務とする
//    （run-state.tsのnextBattleDebuffフィールドコメントにも明記済み）。
import type {
  EnemyMaster,
  EquipmentMaster,
  EventEffect,
  RelicMaster,
  RewardTableMaster,
  SkillMaster,
} from '@/constants/masters/types';
import { CONSUMABLES_BY_CODE } from '@/constants/items';
import { scaleStats, startBattle } from '@/domain/battle/start-battle';
import { determineTurnOrder } from '@/domain/battle/turn-order';
import type { BattleState, EnemyInstance } from '@/domain/battle/types';
import { selectEnemyAction, type EnemyActionContext } from '@/domain/enemy/select-action';
import type { Rng } from '@/domain/shared/rng';

import type { PendingRewardTreasure, RunCharacter, RunState } from '../dungeon/run-state';
import { generateTreasureReward } from '../reward/generate-treasure';

export class EventEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventEffectError';
  }
}

export interface EventEffectMasters {
  equipment: readonly EquipmentMaster[];
  relics: readonly RelicMaster[];
  skills: readonly SkillMaster[];
  enemies: readonly EnemyMaster[];
  rewardTables: readonly RewardTableMaster[];
}

export interface ApplyEventEffectsResult {
  state: RunState;
  triggeredBattle: BattleState | null;
  /** treasureRoll効果の確定内容。呼び出し側がpendingRewardへ反映すること（本関数はここまでは行わない） */
  treasureResult: PendingRewardTreasure | null;
  /** startBattle(fixed)のbonusGold（戦闘勝利時に呼び出し側が通常報酬へ加算する） */
  battleBonusGold: number;
  /** grantExpPerFloor由来のEXP加算量（呼び出し側がgainExperienceへ渡す） */
  grantedExp: number;
}

function floorPct(base: number, pct: number): number {
  return Math.floor((base * pct) / 100);
}

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

function addUniqueAll(list: readonly string[], codes: readonly string[]): string[] {
  return codes.reduce((acc, c) => addUnique(acc, c), [...list]);
}

/**
 * fixed encounter用の簡易startBattle（design方針5参照）。
 * 既存のscaleStats/selectEnemyAction/determineTurnOrderをそのまま再利用し、
 * 固定enemyCodesから等倍(normal)のEnemyInstanceを構築する。
 */
function buildFixedBattle(
  nodeId: string,
  floor: number,
  character: RunCharacter,
  enemyCodes: readonly string[],
  masters: { enemies: readonly EnemyMaster[] },
  rng: Rng,
): BattleState {
  const enemies: EnemyInstance[] = enemyCodes.map((code, index) => {
    const master = masters.enemies.find((m) => m.code === code);
    if (!master) throw new EventEffectError(`buildFixedBattle: unknown enemy code=${code}`);
    const stats = scaleStats(master.baseStats, floor, 1.0, 'normal');
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
      intent: null,
      alive: true,
      isSummon: false,
      recentActionCodes: [],
    };
  });

  const playerHpPct = character.stats.maxHp > 0 ? character.hp / character.stats.maxHp : 0;
  const allyBuffCheck = (code: string): boolean => enemies.every((e) => e.buffs.some((b) => b.code === code));
  const context: EnemyActionContext = {
    turnNo: 1,
    bossPhase: null,
    aliveEnemyCount: enemies.length,
    playerHpPct,
    playerStatusCodes: [],
    alliesAllHaveBuff: allyBuffCheck,
    phaseShiftPending: false,
    turnsInCurrentPhase: 0,
  };
  for (const enemy of enemies) {
    const master = masters.enemies.find((m) => m.code === enemy.code);
    if (!master) throw new EventEffectError(`buildFixedBattle: unknown enemy code=${enemy.code}`);
    enemy.intent = selectEnemyAction(enemy, master.aiRules, master.actions, context, rng);
  }

  const order = determineTurnOrder([
    { id: 'player', spd: character.stats.spd, alive: true },
    ...enemies.map((e, i) => ({ id: `e${i}`, spd: e.stats.spd, alive: e.alive })),
  ]);

  return {
    nodeId,
    nodeType: 'EVENT',
    turnNo: 1,
    order,
    player: { hp: character.hp, sp: character.sp, statuses: [], buffs: [], guarding: false },
    enemies,
    log: [],
    result: 'ongoing',
    bossPhase: null,
    canFlee: true,
  };
}

/**
 * applyEventEffects（docs/20 §2.26の効果適用部分）。
 * 13種類のeffect typeを順に解釈し、RunStateの一時成長系フィールドへ反映する。
 */
export function applyEventEffects(
  state: RunState,
  effects: readonly EventEffect[],
  masters: EventEffectMasters,
  rng: Rng,
): ApplyEventEffectsResult {
  let next: RunState = state;
  let triggeredBattle: BattleState | null = null;
  let treasureResult: PendingRewardTreasure | null = null;
  let battleBonusGold = 0;
  let grantedExp = 0;

  for (const effect of effects) {
    switch (effect.type) {
      case 'runStatModPct': {
        const stat = effect.stat;
        const current = next.character.stats[stat];
        const raw = Math.floor(current * (1 + effect.valuePct / 100));
        const updated = stat === 'maxHp' ? Math.max(1, raw) : Math.max(0, raw);
        const stats = { ...next.character.stats, [stat]: updated };
        const hp = stat === 'maxHp' ? Math.min(next.character.hp, updated) : next.character.hp;
        next = { ...next, character: { ...next.character, stats, hp } };
        break;
      }
      case 'damageHpPct': {
        const dmg = floorPct(next.character.stats.maxHp, effect.pct);
        const hp = Math.max(1, next.character.hp - dmg);
        next = { ...next, character: { ...next.character, hp } };
        break;
      }
      case 'loseHpCurrentPct': {
        const dmg = floorPct(next.character.hp, effect.pct);
        const hp = Math.max(1, next.character.hp - dmg);
        next = { ...next, character: { ...next.character, hp } };
        break;
      }
      case 'healHpPct': {
        const heal = floorPct(next.character.stats.maxHp, effect.pct);
        const hp = Math.min(next.character.stats.maxHp, next.character.hp + heal);
        next = { ...next, character: { ...next.character, hp } };
        break;
      }
      case 'gold': {
        next = { ...next, gold: Math.max(0, next.gold + effect.amount) };
        break;
      }
      case 'goldPctLoss': {
        const loss = floorPct(next.gold, effect.pct);
        next = { ...next, gold: Math.max(0, next.gold - loss) };
        break;
      }
      case 'grantRelic': {
        const candidates = masters.relics.filter((r) => !next.relics.includes(r.code));
        if (candidates.length > 0) {
          const relic = rng.pick(candidates);
          next = {
            ...next,
            relics: [...next.relics, relic.code],
            encountered: { ...next.encountered, relics: addUnique(next.encountered.relics, relic.code) },
          };
        }
        break;
      }
      case 'grantEquipment': {
        const rarityPool = Object.entries(effect.rarityWeights).filter(([, w]) => (w ?? 0) > 0) as [
          string,
          number,
        ][];
        if (rarityPool.length > 0) {
          const rarity = rng.weighted(rarityPool.map(([r, w]) => ({ item: r, weight: w })));
          const candidates = masters.equipment.filter((e) => e.rarity === rarity);
          if (candidates.length > 0) {
            const picked = rng.pick(candidates);
            next = {
              ...next,
              equipment: { ...next.equipment, [picked.slot]: picked.code },
              encountered: {
                ...next.encountered,
                equipment: addUnique(next.encountered.equipment, picked.code),
              },
            };
          }
        }
        break;
      }
      case 'grantConsumable': {
        const meta = CONSUMABLES_BY_CODE[effect.itemCode];
        const existing = next.items.find((i) => i.code === effect.itemCode);
        const currentCount = existing?.count ?? 0;
        const addable = Math.max(0, Math.min(effect.count, meta.maxHold - currentCount));
        const overflow = effect.count - addable;
        let items = next.items;
        if (addable > 0) {
          items = existing
            ? items.map((i) => (i.code === effect.itemCode ? { ...i, count: i.count + addable } : i))
            : [...items, { code: effect.itemCode, count: addable }];
        }
        const gold = overflow > 0 ? next.gold + overflow * meta.overflowGold : next.gold;
        next = { ...next, items, gold };
        break;
      }
      case 'grantExpPerFloor': {
        grantedExp += effect.amountPerFloor * next.position.floor;
        break;
      }
      case 'upgradeRandomSkill': {
        const candidates = next.skills.filter((s) => {
          const master = masters.skills.find((m) => m.code === s.code);
          const maxLevel = master?.maxLevel ?? 3;
          return s.level < maxLevel;
        });
        if (candidates.length > 0) {
          const target = rng.pick(candidates);
          next = {
            ...next,
            skills: next.skills.map((s) => (s.code === target.code ? { ...s, level: s.level + 1 } : s)),
          };
        }
        break;
      }
      case 'startBattle': {
        const battle =
          effect.encounter === 'fixed'
            ? buildFixedBattle(
                next.position.nodeId ?? 'event',
                next.position.floor,
                next.character,
                effect.enemyCodes ?? [],
                masters,
                rng,
              )
            : startBattle({
                nodeId: next.position.nodeId ?? 'event',
                nodeType: 'BATTLE',
                floor: next.position.floor,
                character: next.character,
                difficultyStatMod: 1.0,
                masters: { enemies: masters.enemies },
                rng,
              });
        triggeredBattle = battle;
        battleBonusGold = effect.bonusGold ?? 0;
        next = {
          ...next,
          encountered: {
            ...next.encountered,
            enemies: addUniqueAll(
              next.encountered.enemies,
              battle.enemies.map((e) => e.code),
            ),
          },
        };
        break;
      }
      case 'treasureRoll': {
        treasureResult = generateTreasureReward(effect.tableCode, next.position.floor, next.relics, masters, rng);
        break;
      }
      case 'consumeItemOrHpPct': {
        const item = next.items.find((i) => i.code === effect.itemCode);
        if (item && item.count > 0) {
          const items =
            item.count - 1 <= 0
              ? next.items.filter((i) => i.code !== effect.itemCode)
              : next.items.map((i) => (i.code === effect.itemCode ? { ...i, count: i.count - 1 } : i));
          next = { ...next, items };
        } else {
          const dmg = floorPct(next.character.hp, effect.fallbackHpCurrentPct);
          const hp = Math.max(1, next.character.hp - dmg);
          next = { ...next, character: { ...next.character, hp } };
        }
        break;
      }
      case 'weakenNextBattle': {
        next = { ...next, nextBattleDebuff: 'weaken' };
        break;
      }
    }
  }

  return { state: next, triggeredBattle, treasureResult, battleBonusGold, grantedExp };
}
