import { NextResponse } from 'next/server';

import { SKILLS } from '@/constants/masters/skills';
import type { RunState } from '@/domain/dungeon/run-state';
import { restActionSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

/** 休憩でのHP回復率（docs/27 Phase7指示: HP50%回復） */
const REST_HEAL_PCT = 50;
/** スキル強化の最大Lv（docs/27 Phase7指示・SkillMaster.maxLevelが無い場合のフォールバック） */
const DEFAULT_MAX_SKILL_LEVEL = 3;

/**
 * API-505 休憩実行（docs/13 §4.6）。heal / upgrade_skill / delete_skillの三択。
 * 完了後pendingReward=null, phase='map_select'（実装指示: 三択の3つ目「delete_skill」を追加）。
 */
export const POST = apiHandler('API-505', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, restActionSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-505',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.pendingReward === null || state.pendingReward.type !== 'rest') {
        throw new AppError('ERR_RUN_STATE_INVALID', '現在休憩できません');
      }

      let character = state.character;
      let skills = state.skills;
      let response: Record<string, unknown> = {};

      if (input.action === 'heal') {
        const healAmount = Math.floor(state.character.stats.maxHp * (REST_HEAL_PCT / 100));
        const hp = Math.min(state.character.stats.maxHp, state.character.hp + healAmount);
        character = { ...character, hp };
        response = { healed: healAmount };
      } else {
        const skillCode = input.skillCode as string;
        const owned = state.skills.find((s) => s.code === skillCode);
        if (!owned) {
          throw new AppError('ERR_INVALID_ACTION', 'そのスキルを所持していません');
        }
        const master = SKILLS.find((s) => s.code === skillCode);
        if (input.action === 'upgrade_skill') {
          const maxLevel = master?.maxLevel ?? DEFAULT_MAX_SKILL_LEVEL;
          if (owned.level >= maxLevel) {
            throw new AppError('ERR_INVALID_ACTION', 'このスキルはこれ以上強化できません');
          }
          skills = state.skills.map((s) => (s.code === skillCode ? { ...s, level: s.level + 1 } : s));
          response = { upgraded: skillCode, level: owned.level + 1 };
        } else {
          // delete_skill: 固有スキル（isInnate）は削除不可
          if (master?.isInnate) {
            throw new AppError('ERR_INVALID_ACTION', '固有スキルは削除できません');
          }
          skills = state.skills.filter((s) => s.code !== skillCode);
          response = { deleted: skillCode };
        }
      }

      const nextState: RunState = {
        ...state,
        character,
        skills,
        pendingReward: null,
        position: { ...state.position, phase: 'map_select' },
      };
      return { nextState, response: { ...response, position: nextState.position } };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
