import { beforeEach, describe, expect, it } from 'vitest';

import { AppError } from './errors';
import { AUTH_RATE_LIMIT, enforceRateLimit, resetRateLimitStore } from './rate-limit';

describe('enforceRateLimit', () => {
  beforeEach(() => resetRateLimitStore());

  it('認証系はウィンドウ内5回まで許可し、6回目で429（CORE_SPEC §12）', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(() => enforceRateLimit('auth:login:1.2.3.4', AUTH_RATE_LIMIT, t0 + i)).not.toThrow();
    }
    try {
      enforceRateLimit('auth:login:1.2.3.4', AUTH_RATE_LIMIT, t0 + 5);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe('ERR_RATE_LIMITED');
      expect((e as AppError).status).toBe(429);
    }
  });

  it('ウィンドウ経過後はカウンタがリセットされる', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) enforceRateLimit('b', AUTH_RATE_LIMIT, t0);
    expect(() =>
      enforceRateLimit('b', AUTH_RATE_LIMIT, t0 + AUTH_RATE_LIMIT.windowMs),
    ).not.toThrow();
  });

  it('バケットは独立している（別IPに影響しない）', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) enforceRateLimit('auth:login:a', AUTH_RATE_LIMIT, t0);
    expect(() => enforceRateLimit('auth:login:b', AUTH_RATE_LIMIT, t0)).not.toThrow();
  });
});
