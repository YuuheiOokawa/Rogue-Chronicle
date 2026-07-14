import { NextResponse } from 'next/server';

import { CHARACTERS } from '@/constants/masters/characters';
import { EQUIPMENT } from '@/constants/masters/equipment';
import type { RunState } from '@/domain/dungeon/run-state';
import { recalcStatsForEquipmentChange } from '@/domain/dungeon/run-equipment';
import { runEquipmentActionSchema } from '@/schemas/reward';
import { apiHandler, parseBody } from '@/server/services/api';
import { AppError } from '@/server/services/errors';
import { requireUser } from '@/server/services/session';
import { requireIdempotencyKey, withActiveRunMutation } from '@/server/usecases/shared/run-mutation';

export const dynamic = 'force-dynamic';

const RUN_EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'] as const;

function addUnique(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}

/**
 * API-507 装備変更（ラン内、docs/13 §4.6）。
 * 「所持」判定はrun_state.encountered.equipment（このランで一度でも入手した装備。初期装備を含む。
 * run-state.tsコメント参照）で行う。RunStateには装備スロット3枠以外の“予備在庫”が無いため、
 * 一度別のものへ差し替えた装備でも、encountered.equipmentに記録が残っていれば再装着できる設計とする
 * （実装判断。docs/29 決定ログ参照）。戦闘中（phase='battle'）は変更不可。
 */
export const POST = apiHandler('API-507', async (_traceId, req: Request) => {
  const session = await requireUser();
  const idempotencyKey = requireIdempotencyKey(req);
  const input = await parseBody(req, runEquipmentActionSchema);

  const result = await withActiveRunMutation(
    {
      userId: session.userId,
      apiId: 'API-507',
      idempotencyKey,
      requestBody: input,
      expectedVersion: input.version,
    },
    (state) => {
      if (state.position.phase === 'battle') {
        throw new AppError('ERR_RUN_STATE_INVALID', '戦闘中は装備を変更できません');
      }

      const master = EQUIPMENT.find((e) => e.code === input.equipmentCode);
      if (!master) {
        throw new AppError('ERR_INVALID_ACTION', '不明な装備です');
      }
      const characterMaster = CHARACTERS.find((c) => c.code === state.character.code);
      const favoredWeaponType = characterMaster?.favoredWeaponType ?? null;

      let nextState: RunState;
      let response: Record<string, unknown>;

      if (input.action === 'discard') {
        const slotKey = RUN_EQUIPMENT_SLOTS.find((key) => state.equipment[key] === input.equipmentCode);
        if (!slotKey) {
          throw new AppError('ERR_INVALID_ACTION', 'その装備は現在装着していません');
        }
        const character = favoredWeaponType
          ? recalcStatsForEquipmentChange(state.character, favoredWeaponType, master, null)
          : state.character;
        const equipment = { ...state.equipment, [slotKey]: null };
        nextState = { ...state, character, equipment };
        response = { discarded: input.equipmentCode, equipment };
      } else {
        // equip
        if (!state.encountered.equipment.includes(input.equipmentCode)) {
          throw new AppError('ERR_INVALID_ACTION', 'その装備は所持していません');
        }
        const slot = master.slot;
        const currentCode = state.equipment[slot];
        const removed = currentCode ? (EQUIPMENT.find((e) => e.code === currentCode) ?? null) : null;
        const character = favoredWeaponType
          ? recalcStatsForEquipmentChange(state.character, favoredWeaponType, removed, master)
          : state.character;
        const equipment = { ...state.equipment, [slot]: master.code };
        const encountered = {
          ...state.encountered,
          equipment: addUnique(state.encountered.equipment, master.code),
        };
        nextState = { ...state, character, equipment, encountered };
        response = { equipped: master.code, slot, equipment };
      }

      return { nextState, response };
    },
  );

  return NextResponse.json({ ...(result.response as object), version: result.version });
});
