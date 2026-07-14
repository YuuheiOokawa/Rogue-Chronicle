import { NextResponse } from 'next/server';

import { CHARACTERS } from '@/constants/masters/characters';
import { ENEMIES } from '@/constants/masters/enemies';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { SKILLS } from '@/constants/masters/skills';
import { checkBattleEnd } from '@/domain/battle/check-end';
import { InvalidBattleActionError, executePlayerAction } from '@/domain/battle/execute-player-action';
import type { ActionLogEntry } from '@/domain/battle/types';
import type { RunState } from '@/domain/dungeon/run-state';
import { executeEnemyAction } from '@/domain/enemy/execute-enemy-action';
import { gainExperience } from '@/domain/progression/experience';
import { calculateBattleReward } from '@/domain/reward/battle-reward';
import { generateSkillChoices } from '@/domain/skill/generate-choices';
import { createRng } from '@/domain/shared/rng';
import { battleActionRequestSchema } from '@/schemas/battle';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import {
  requireIdempotencyKey,
  withActiveRunMutation,
} from '@/server/usecases/shared/run-mutation';
import { toBattleView } from '@/server/usecases/battle/battle-view';

export const dynamic = 'force-dynamic';

/**
 * 敗北時にrankExpへ軽く加算する値（到達階層×この値）。
 * Phase6ではソウルシャード付与等の本格的なリザルト精算はPhase8対象のため未実装
 * （実装指示: 「earned.rankExpに到達階層ベースの値を軽く加算する程度で可」）。
 */
const LOSE_RANK_EXP_PER_FLOOR = 5;
/** MVPは難易度Normal固定のため報酬倍率は1.0（docs/27 Phase6指示。startBattleのdifficultyStatModと同じ扱い） */
const NORMAL_REWARD_MOD = 1.0;

type BattleEndResult = 'win' | 'lose' | 'fled';

interface PendingBattleLog {
  runId: string;
  floor: number;
  nodeId: string;
  enemyCodes: string[];
  result: BattleEndResult;
  turns: ActionLogEntry[];
}

/**
 * API-402 行動実行（docs/13 §4.5・最重要）。
 * 共通順序: 冪等キー確認 → version検証 → 正当性検証 → domain解決 → saveRunProgress（CLAUDE.md絶対ルール4）。
 *
 * domain層の既知のギャップ（バグ扱いにせず本ルートで吸収。禁止事項によりdomainファイルは変更しない）:
 * - `executePlayerAction`のitemアクションはRunState.items（所持数）を検証・消費しない
 *   （domain/battle/execute-player-action.tsのコメント参照）。本ルートで所持数検証と消費を行う。
 * - `BattleState.turnNo`はstartBattle後、どのdomain関数からも増加されない
 *   （executeEnemyActionはselectEnemyActionへ渡すcontext.turnNoをローカルで+1するのみで、
 *   battle.turnNo自体は更新しない）。本ルートで1ラウンド（プレイヤー行動+敵行動一巡）完了ごとに+1する。
 */
export const POST = apiHandler('API-402', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, battleActionRequestSchema);

  let pendingBattleLog: PendingBattleLog | null = null;

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-402',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state, run) => {
      if (state.position.phase !== 'battle' || state.battle === null) {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在は戦闘中ではありません');
      }

      // 行動正当性のサーバー検証（DEC-007）: アイテム所持数はdomain層で検証されないためここで検証する
      if (input.action.type === 'item') {
        const requestedItemCode = input.action.itemCode;
        const owned = state.items.find((i) => i.code === requestedItemCode);
        if (!owned || owned.count <= 0) {
          throw new AppError('ERR_INVALID_ACTION', 'そのアイテムを所持していません');
        }
      }

      const rng = createRng(state.map.seed, state.rngCursor);

      let execResult;
      try {
        execResult = executePlayerAction(
          state.battle,
          state.character,
          state.skills,
          SKILLS,
          input.action,
          rng,
        );
      } catch (err) {
        if (err instanceof InvalidBattleActionError) {
          throw new AppError('ERR_INVALID_ACTION', '現在その行動は実行できません', {
            reason: err.message,
          });
        }
        throw err;
      }

      let battle = execResult.battle;
      let character = execResult.character;
      const logs: ActionLogEntry[] = [...execResult.logs];

      // アイテム消費（気絶等でdomain側が行動をスキップした場合は消費しない）
      let items = state.items;
      if (input.action.type === 'item') {
        const skipped = execResult.logs.some((l) => l.note === 'incapacitated');
        if (!skipped) {
          const itemCode = input.action.itemCode;
          items = state.items.map((i) => (i.code === itemCode ? { ...i, count: i.count - 1 } : i));
        }
      }

      // 敵行動の解決（プレイヤーの行動で終了していなければ、生存する敵を順に処理）
      let battleEndedResult: BattleEndResult | null = null;
      if (battle.result === 'fled') {
        battleEndedResult = 'fled';
      } else {
        const afterPlayer = checkBattleEnd(battle);
        if (afterPlayer !== null) {
          battleEndedResult = afterPlayer;
        } else {
          // 召喚で今ラウンド中に追加された敵は行動しない（intent未設定のため。docs/19実装注意5）
          const enemyCount = battle.enemies.length;
          for (let i = 0; i < enemyCount; i += 1) {
            if (!battle.enemies[i].alive) continue;
            const enemyResult = executeEnemyAction(battle, character, i, { enemies: ENEMIES }, rng);
            battle = enemyResult.battle;
            character = enemyResult.character;
            logs.push(...enemyResult.logs);
            const midEnd = checkBattleEnd(battle);
            if (midEnd !== null) {
              battleEndedResult = midEnd;
              break;
            }
          }
        }
      }

      const battleEnded = battleEndedResult !== null;
      // domain層のギャップ吸収: 1ラウンド完了時にturnNoを進める（継続時のみ）
      if (!battleEnded) {
        battle = { ...battle, turnNo: battle.turnNo + 1 };
      }

      let nextStatus: 'active' | 'cleared' | 'failed' = 'active';
      let gold = state.gold;
      let earned = state.earned;
      let visited = state.visited;
      let responseExtra: Record<string, unknown> = {};
      let pendingSkillChoice: RunState['pendingReward'] = null;

      if (battleEndedResult === 'win') {
        // 召喚された敵は報酬対象外（docs/19実装注意10）
        const defeated = battle.enemies
          .filter((e) => !e.isSummon)
          .map((e) => {
            const master = ENEMIES.find((m) => m.code === e.code);
            return { baseExp: master?.baseExp ?? 0, baseGold: master?.baseGold ?? 0 };
          });
        const reward = calculateBattleReward(
          defeated,
          state.position.floor,
          NORMAL_REWARD_MOD,
          NORMAL_REWARD_MOD,
          // ドロップ抽選（Phase7 reward-tables連携）はPhase8のリザルト精算とあわせて本格導入する
          // ため、Phase6互換のこの経路では引き続きドロップなし（dropTableCode=null）で据え置く
          // （実装指示: 「変更禁止」ではないがPhase6挙動を壊さない最小修正の方針）。
          null,
          state.relics,
          { rewardTables: REWARD_TABLES, equipment: EQUIPMENT, relics: RELICS },
          rng,
        );
        // Phase7: fixed encounter（EV-10等）由来のボーナスゴールドをここで通常報酬へ加算し、
        // run_state.pendingBattleBonusGoldは戦闘決着（勝敗問わず）で必ず0へリセットする
        // （domain/battle配下は変更禁止のためBattleStateへは持たせない設計。run-state.tsコメント参照）。
        gold = state.gold + reward.gold + state.pendingBattleBonusGold;

        const characterMaster = CHARACTERS.find((c) => c.code === character.code);
        const growth = characterMaster?.growthRates ?? { maxHp: 1, atk: 1, def: 1, spd: 1 };
        const gainResult = gainExperience(character, reward.exp, growth);
        character = gainResult.character;

        const isBoss = battle.nodeType === 'BOSS';
        const isElite = battle.nodeType === 'ELITE';
        earned = {
          ...state.earned,
          kills: state.earned.kills + 1,
          eliteKills: state.earned.eliteKills + (isElite ? 1 : 0),
          rankExp: state.earned.rankExp + (isBoss ? 100 : 10),
          // ソウルシャードはdocs/05 §5.4の目安（通常+4/強敵+8/エリート+15/ボス+40）どおり
          // calculateBattleRewardが算出済み。ここで反映しないとfinalizeの獲得量が常に0になる
          // 実装漏れがあったため修正（統合検証時に発見）。
          soulShards: state.earned.soulShards + reward.soulShards,
        };
        nextStatus = isBoss ? 'cleared' : 'active';
        // Phase7: レベルアップ分のスキル3択をpendingRewardへキューする（docs/27 Phase7）。
        // 設計判断: run_state.pendingReward.skill_choiceにはレベルアップ回数のキュー機構が無い
        // （docs/13 API-501の「remaining」はrun-state.tsスキーマに反映されなかったため、
        //  複数レベルアップ時も1回の3択提示に単純化する。docs/29 決定ログ参照）。
        // ボス撃破（nextStatus='cleared'）はAPI-306/307のリザルトフローへ直結するため、
        // 別担当実装との競合を避けるためスキル3択は挟まない（ボス戦のレベルアップは即時反映のみ）。
        if (!isBoss && gainResult.levelUps > 0) {
          const choices = generateSkillChoices(state.skills, character.code, { skills: SKILLS }, rng);
          pendingSkillChoice = { type: 'skill_choice', choices, rerollRemaining: 1, claimed: false };
        }
        responseExtra = {
          result: 'win',
          reward: { gold: reward.gold, exp: reward.exp, drops: reward.drops },
          ...(gainResult.levelUps > 0 ? { levelUp: { levels: gainResult.levelUps } } : {}),
        };
      } else if (battleEndedResult === 'lose') {
        nextStatus = 'failed';
        earned = {
          ...state.earned,
          rankExp: state.earned.rankExp + state.position.floor * LOSE_RANK_EXP_PER_FLOOR,
        };
        responseExtra = { result: 'lose' };
      } else if (battleEndedResult === 'fled') {
        // 逃走成功: ノードは未クリア扱い。入場時にvisitedへ追加済みのため取り消す（実装判断・docs/27 Phase6指示）
        visited = state.visited.filter((id) => id !== battle.nodeId);
        responseExtra = { result: 'fled' };
      }

      if (battleEnded) {
        pendingBattleLog = {
          runId: run.id,
          floor: state.position.floor,
          nodeId: battle.nodeId,
          enemyCodes: battle.enemies.map((e) => e.code),
          result: battleEndedResult as BattleEndResult,
          turns: battle.log,
        };
      }

      const nextPhase = pendingSkillChoice !== null ? 'reward_pending' : battleEnded ? 'map_select' : 'battle';

      const nextState: RunState = {
        ...state,
        position: { ...state.position, phase: nextPhase },
        battle: battleEnded ? null : battle,
        character,
        items,
        gold,
        earned,
        visited,
        pendingReward: pendingSkillChoice,
        // 戦闘決着（勝敗問わず）でボーナスゴールドを消費済みにリセットする（継続中は据え置き）
        pendingBattleBonusGold: battleEnded ? 0 : state.pendingBattleBonusGold,
        rngCursor: rng.cursor,
      };

      return {
        nextState,
        nextStatus,
        snapshot: battleEnded, // 戦闘終了は区切りが良いためチェックポイント保存（docs/15）
        response: {
          logs,
          battle: toBattleView(battle, character, state.skills, items),
          battleEnded,
          ...responseExtra,
          runStatus: nextStatus,
          position: nextState.position,
        },
      };
    },
  );

  // battle_logs永続化はmutate（同期関数）の外で行う（docs/13実装指示。非アトミックだが補助ログのため許容）
  if (pendingBattleLog !== null) {
    const log = pendingBattleLog as PendingBattleLog;
    await prisma.battleLog.create({
      data: {
        runId: log.runId,
        userId: session.userId,
        floor: log.floor,
        nodeId: log.nodeId,
        enemyCodes: log.enemyCodes,
        result: log.result,
        turns: log.turns,
      },
    });
  }

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
