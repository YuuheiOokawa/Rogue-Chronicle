import { NextResponse } from 'next/server';

import { prisma } from '@/server/services/prisma';

// ビルド時のプリレンダリングを禁止（DB接続はリクエスト時のみ行う）
export const dynamic = 'force-dynamic';

/**
 * ヘルスチェックAPI（docs/23_Logging_Monitoring.md）。
 * 外形監視（UptimeRobot等）が5分間隔で叩く。DB接続（SELECT 1）まで確認する。
 * 200 = healthy / 503 = DB到達不能（degraded）。
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk ? 'up' : 'down',
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
