import { NextResponse } from 'next/server';

import { CHARACTERS } from '@/constants/masters/characters';
import { ENEMIES } from '@/constants/masters/enemies';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RANDOM_EVENTS } from '@/constants/masters/events';
import { RELICS } from '@/constants/masters/relics';
import { REWARD_TABLES } from '@/constants/masters/reward-tables';
import { SKILLS } from '@/constants/masters/skills';
import type { EventChoiceDef } from '@/constants/masters/types';
import { applyStatusEffect } from '@/domain/battle/status-effects';
import {
  BLESS_CHOICES,
  BLESS_FIXED_EVENT_CODE,
  CURSE_CHOICES,
  CURSE_FIXED_EVENT_CODE,
} from '@/domain/dungeon/select-node';
import type { RunState } from '@/domain/dungeon/run-state';
import { applyEventEffects, type EventEffectMasters } from '@/domain/event/apply-effects';
import { resolveEventOutcome } from '@/domain/event/resolve-outcome';
import { gainExperience } from '@/domain/progression/experience';
import { createRng } from '@/domain/shared/rng';
import { generateSkillChoices } from '@/domain/skill/generate-choices';
import { eventChooseSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

const EVENT_MASTERS: EventEffectMasters = {
  equipment: EQUIPMENT,
  relics: RELICS,
  skills: SKILLS,
  enemies: ENEMIES,
  rewardTables: REWARD_TABLES,
};

function sortedChoiceDefs(eventCode: string): readonly EventChoiceDef[] {
  if (eventCode === BLESS_FIXED_EVENT_CODE) return [...BLESS_CHOICES].sort((a, b) => a.order - b.order);
  if (eventCode === CURSE_FIXED_EVENT_CODE) return [...CURSE_CHOICES].sort((a, b) => a.order - b.order);
  const event = RANDOM_EVENTS.find((e) => e.code === eventCode);
  if (!event) throw new AppError('ERR_RUN_STATE_INVALID', '不明なイベントです');
  return [...event.choices].sort((a, b) => a.order - b.order);
}

/**
 * API-506 イベント選択（docs/13 §4.6）。EVENT/BLESS/CURSEの選択肢提示と、HEAL/STORYの自動解決
 * クローズを両方扱う。BLESS/CURSEの固定選択肢もselect-node.tsで定義した同一のEventChoiceDef形式を
 * 経由し、resolveEventOutcome/applyEventEffects（変更禁止のdomain/event）をそのまま再利用する。
 *
 * 優先順位（同時発生は現行マスタデータ上は無いが、防御的に定める）:
 * 1. 効果内にstartBattleがあれば戦闘へ遷移（phase='battle'、pendingReward=null）
 * 2. 効果内にtreasureRollがあれば宝箱をpendingRewardへ（phase='reward_pending'のまま）
 * 3. grantExpPerFloorでレベルアップが発生すればスキル3択をpendingRewardへ
 *    （複数レベルアップも1回の3択に単純化。docs/29 決定ログ参照）
 * 4. 上記いずれも無ければpendingReward=null・phase='map_select'
 */
export const POST = apiHandler('API-506', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, eventChooseSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-506',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.pendingReward === null || state.pendingReward.type !== 'event') {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在選択できるイベントがありません');
      }
      const pending = state.pendingReward;

      let nextState: RunState;
      let response: Record<string, unknown>;

      // HEAL/STORY: ノード進入時に既に効果を適用済み。確認してクローズするのみ（choiceIndex不要）
      if (pending.autoResolved) {
        nextState = {
          ...state,
          pendingReward: null,
          position: { ...state.position, phase: 'map_select' },
        };
        response = { closed: true, resultText: pending.autoResolved.resultText, position: nextState.position };
        return { nextState, response };
      }

      if (pending.choices.length === 0) {
        throw new AppError('ERR_RUN_STATE_INVALID', '選択肢のないイベントです');
      }
      if (input.choiceIndex === undefined) {
        throw new AppError('ERR_INVALID_ACTION', 'choiceIndexを指定してください');
      }
      const choiceDefs = sortedChoiceDefs(pending.eventCode);
      const choiceDef = choiceDefs[input.choiceIndex];
      if (!choiceDef) {
        throw new AppError('ERR_INVALID_ACTION', '存在しない選択肢が選択されました');
      }

      const rng = createRng(state.map.seed, state.rngCursor);
      const outcome = resolveEventOutcome(choiceDef.outcomes, rng);
      const afterEffects = applyEventEffects(state, outcome.effects, EVENT_MASTERS, rng);
      let workingState = afterEffects.state;

      let levelUps = 0;
      if (afterEffects.grantedExp > 0) {
        const characterMaster = CHARACTERS.find((c) => c.code === workingState.character.code);
        const growth = characterMaster?.growthRates ?? { maxHp: 1, atk: 1, def: 1, spd: 1 };
        const gainResult = gainExperience(workingState.character, afterEffects.grantedExp, growth);
        workingState = { ...workingState, character: gainResult.character };
        levelUps = gainResult.levelUps;
      }

      // 宝箱・イベント経由のソウルシャード獲得（docs/05 §5.4「宝箱・イベント平均+5」。ISSUE-013解消）。
      // STORYはselect-node.tsのノード進入時点で既に+5済み・HEALはdocs上シャード言及が無いため対象外とし、
      // EVENT/BLESS/CURSEの選択確定（本分岐、autoResolvedを通らないケース）にのみ加算する。
      workingState = {
        ...workingState,
        earned: { ...workingState.earned, soulShards: workingState.earned.soulShards + 5 },
      };

      let finalState: RunState;
      if (afterEffects.triggeredBattle !== null) {
        let player = afterEffects.triggeredBattle.player;
        let nextBattleDebuff = workingState.nextBattleDebuff;
        if (nextBattleDebuff === 'weaken') {
          const applied = applyStatusEffect(player.statuses, 'weaken', 100, 0, rng);
          player = { ...player, statuses: applied.statuses };
          nextBattleDebuff = null;
        }
        finalState = {
          ...workingState,
          position: { ...workingState.position, phase: 'battle' },
          battle: { ...afterEffects.triggeredBattle, player },
          nextBattleDebuff,
          pendingReward: null,
          pendingBattleBonusGold: afterEffects.battleBonusGold,
          rngCursor: rng.cursor,
        };
      } else if (afterEffects.treasureResult !== null) {
        finalState = {
          ...workingState,
          position: { ...workingState.position, phase: 'reward_pending' },
          pendingReward: afterEffects.treasureResult,
          rngCursor: rng.cursor,
        };
      } else if (levelUps > 0) {
        const choices = generateSkillChoices(
          workingState.skills,
          workingState.character.code,
          { skills: SKILLS },
          rng,
        );
        finalState = {
          ...workingState,
          position: { ...workingState.position, phase: 'reward_pending' },
          // rerollRemaining基本値1 + 永続強化upg_reroll_1のボーナス（ラン開始時スナップショット、Phase8）
          pendingReward: {
            type: 'skill_choice',
            choices,
            rerollRemaining: 1 + workingState.rerollBonus,
            claimed: false,
          },
          rngCursor: rng.cursor,
        };
      } else {
        finalState = {
          ...workingState,
          position: { ...workingState.position, phase: 'map_select' },
          pendingReward: null,
          rngCursor: rng.cursor,
        };
      }

      nextState = finalState;
      response = {
        resultText: outcome.resultText,
        triggeredBattle: afterEffects.triggeredBattle !== null,
        position: finalState.position,
      };
      return { nextState, response };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
