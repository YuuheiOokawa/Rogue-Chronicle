import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiHandler } from '@/server/services/api';
import { prisma } from '@/server/services/prisma';
import type { AnnouncementsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

/** クエリ検証（docs/13 API-104） */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.coerce.number().int().positive().optional(), // announcements.id（新しい順の続き）
});

/**
 * API-104 お知らせ取得（docs/13 §4.2）。認証不要。
 * 公開中（published_at <= now かつ expires_at がnullまたは未来）を新しい順に返す。
 */
export const GET = apiHandler('API-104', async (_traceId, req: Request) => {
  const url = new URL(req.url);
  const query = querySchema.parse({
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });

  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: { publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor !== undefined ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  const body: AnnouncementsResponse = {
    items: items.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      publishedAt: a.publishedAt.toISOString(),
    })),
    nextCursor: rows.length > query.limit && last ? String(last.id) : null,
  };
  const res = NextResponse.json(body);
  res.headers.set('Cache-Control', 'public, max-age=60');
  return res;
});
