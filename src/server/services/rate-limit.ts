import { AppError } from '@/server/services/errors';

/**
 * レート制限（docs/13 §2 / docs/04 §11）。
 * MVPは固定ウィンドウカウンタをサーバーレス関数のインメモリで持つベストエフォート方式
 * （インスタンスごとに独立するため実効値は緩む。認証の実質的防壁はDB上のログインロック）。
 * 将来: Upstash Redis等で厳密化（docs/13 未決事項）。
 */

interface WindowEntry {
  count: number;
  windowStartMs: number;
}

const store = new Map<string, WindowEntry>();
const MAX_ENTRIES = 10_000; // メモリ保護

export interface RateLimitRule {
  /** ウィンドウ長（ミリ秒） */
  windowMs: number;
  /** ウィンドウ内の許容回数 */
  max: number;
}

/** 認証系: 5回/分/IP（CORE_SPEC §12） */
export const AUTH_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 5 };
/** 一般API: 60回/分/ユーザー */
export const GENERAL_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 60 };

/**
 * 制限超過なら ERR_RATE_LIMITED(429) をthrowする。
 * @param bucket 例: `auth:login:${ip}` / `api:${userId}`
 */
export function enforceRateLimit(bucket: string, rule: RateLimitRule, nowMs = Date.now()): void {
  if (store.size > MAX_ENTRIES) store.clear();

  const entry = store.get(bucket);
  if (!entry || nowMs - entry.windowStartMs >= rule.windowMs) {
    store.set(bucket, { count: 1, windowStartMs: nowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > rule.max) {
    throw new AppError('ERR_RATE_LIMITED');
  }
}

/** テスト用: 内部状態のリセット */
export function resetRateLimitStore(): void {
  store.clear();
}
