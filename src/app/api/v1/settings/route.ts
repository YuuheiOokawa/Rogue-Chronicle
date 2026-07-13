import { NextResponse } from 'next/server';

import { settingsUpdateSchema } from '@/schemas/settings';
import { apiHandler, parseBody } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import { requireUser } from '@/server/services/session';
import type { SettingsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** user_settings行 → APIレスポンス（@prisma/client型はapp層でimport不可のため構造型で受ける） */
function toSettingsResponse(settings: {
  battleSpeed: number;
  damageDisplay: boolean;
  screenShake: boolean;
  colorAssist: boolean;
}): SettingsResponse {
  return {
    battleSpeed: settings.battleSpeed === 2 ? 2 : 1,
    damageDisplay: settings.damageDisplay,
    screenShake: settings.screenShake,
    colorAssist: settings.colorAssist,
  };
}

/** API-602 設定取得（docs/13 §4.9。無ければデフォルトで作成して返す） */
export const GET = apiHandler('API-602', async () => {
  const session = await requireUser();
  const settings = await prisma.userSettings.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId },
    update: {},
  });
  return NextResponse.json(toSettingsResponse(settings));
});

/** API-603 設定更新（全項目上書きのため自然冪等。演出設定のみでゲーム進行に影響しない） */
export const PUT = apiHandler('API-603', async (_traceId, req: Request) => {
  const session = await requireUser();
  const input = await parseBody(req, settingsUpdateSchema);
  const settings = await prisma.userSettings.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, ...input },
    update: input,
  });
  return NextResponse.json(toSettingsResponse(settings));
});
