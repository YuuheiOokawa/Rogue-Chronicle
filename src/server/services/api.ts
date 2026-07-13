import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

import { AppError, type ErrorResponseBody } from '@/server/services/errors';
import { logger } from '@/server/services/logger';

/**
 * APIルートハンドラ共通ラッパー（docs/13 §2）。
 * - traceId発行（応答ヘッダ X-Trace-Id とエラーボディに含める）
 * - AppError / ZodError → 共通エラー形式 { errorCode, message, details, traceId, timestamp }
 * - アクセスログ（durationMs付き。PIIなし）
 */
export function apiHandler<Args extends unknown[]>(
  apiId: string,
  handler: (traceId: string, ...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    const traceId = randomUUID();
    const startedAt = Date.now();
    let status = 200;
    try {
      const res = await handler(traceId, ...args);
      status = res.status;
      res.headers.set('X-Trace-Id', traceId);
      return res;
    } catch (err) {
      const body = toErrorBody(err, traceId);
      status = err instanceof AppError ? err.status : err instanceof ZodError ? 400 : 500;
      if (status >= 500) {
        logger.error('api_error', { traceId, apiId, status, errorName: (err as Error)?.name });
      }
      const res = NextResponse.json(body, { status });
      res.headers.set('X-Trace-Id', traceId);
      return res;
    } finally {
      logger.info('api_access', { traceId, apiId, status, durationMs: Date.now() - startedAt });
    }
  };
}

function toErrorBody(err: unknown, traceId: string): ErrorResponseBody {
  const timestamp = new Date().toISOString();
  if (err instanceof AppError) {
    return {
      errorCode: err.errorCode,
      message: err.message,
      details: err.details,
      traceId,
      timestamp,
    };
  }
  if (err instanceof ZodError) {
    return {
      errorCode: 'ERR_VALIDATION',
      message: '入力内容に誤りがあります',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      traceId,
      timestamp,
    };
  }
  return { errorCode: 'ERR_INTERNAL', message: 'サーバーエラーが発生しました', traceId, timestamp };
}

/** リクエストボディをZodで検証する（.strict()スキーマを渡すこと） */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError('ERR_VALIDATION', 'リクエストボディが不正です');
  }
  return schema.parse(json);
}

/** クライアントIP取得（Vercel: x-forwarded-for 先頭） */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
