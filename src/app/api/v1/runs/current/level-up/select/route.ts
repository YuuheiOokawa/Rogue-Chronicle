import { NextResponse } from 'next/server';

import { SKILLS } from '@/constants/masters/skills';
import type { RunState } from '@/domain/dungeon/run-state';
import { createRng } from '@/domain/shared/rng';
import { HEAL_FALLBACK_SKILL_CODE, generateSkillChoices } from '@/domain/skill/generate-choices';
import { applySkillChoice } from '@/domain/skill/select-skill';
import { skillSelectSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/** スキップ/フォールバックカード選択時のHP回復率（docs/27 Phase7指示） */
const SKIP_HEAL_PCT = 10;

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

/**
 * API-502 スキル選択（3択/リロール/スキップ、docs/13 §4.6）。
 * pickはchoices配列のindexのみ受理（候補外選択を構造的に排除。DEC-007）。
 */
export const POST = apiHandler('API-502', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, skillSelectSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-502',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.pendingReward === null || state.pendingReward.type !== 'skill_choice') {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在選択可能なスキル候補がありません');
      }
      const pending = state.pendingReward;

      let nextState: RunState;
      let response: Record<string, unknown>;

      if (input.action === 'reroll') {
        if (pending.rerollRemaining <= 0) {
          throw new AppError('ERR_INVALID_ACTION', 'リロール回数が残っていません');
        }
        const rng = createRng(state.map.seed, state.rngCursor);
        const choices = generateSkillChoices(state.skills, state.character.code, { skills: SKILLS }, rng);
        const rerollRemaining = pending.rerollRemaining - 1;
        nextState = {
          ...state,
          pendingReward: { ...pending, choices, rerollRemaining },
          rngCursor: rng.cursor,
        };
        response = { rerolled: true, pending: { rerollRemaining, choices } };
      } else if (input.action === 'skip') {
        const healAmount = Math.floor(state.character.stats.maxHp * (SKIP_HEAL_PCT / 100));
        const hp = Math.min(state.character.stats.maxHp, state.character.hp + healAmount);
        nextState = {
          ...state,
          character: { ...state.character, hp },
          pendingReward: null,
          position: { ...state.position, phase: 'map_select' },
        };
        response = { skipped: true, healed: healAmount, position: nextState.position };
      } else {
        // pick
        const choiceIndex = input.choiceIndex as number;
        const choice = pending.choices[choiceIndex];
        if (!choice) {
          throw new AppError('ERR_INVALID_ACTION', '存在しない候補が選択されました');
        }

        let character = state.character;
        let skills = state.skills;
        let encounteredSkills = state.encountered.skills;

        if (choice.skillCode === HEAL_FALLBACK_SKILL_CODE) {
          const healAmount = Math.floor(state.character.stats.maxHp * (SKIP_HEAL_PCT / 100));
          character = { ...character, hp: Math.min(character.stats.maxHp, character.hp + healAmount) };
        } else {
          const applied = applySkillChoice(state.skills, choice, { skills: SKILLS });
          skills = applied.ownedSkills;
          encounteredSkills = addUnique(encounteredSkills, choice.skillCode);
        }

        nextState = {
          ...state,
          character,
          skills,
          encountered: { ...state.encountered, skills: encounteredSkills },
          pendingReward: null,
          position: { ...state.position, phase: 'map_select' },
        };
        response = { picked: choice, position: nextState.position };
      }

      return { nextState, response };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
