import { describe, expect, it } from 'vitest';

import {
  isLocked,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  onLoginFailure,
  onLoginSuccess,
} from './login-lockout';

const now = new Date('2026-07-13T00:00:00Z');

describe('login-lockout', () => {
  it('5回目の失敗でロックされる（docs/14 §7）', () => {
    let state = { failedAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      state = onLoginFailure(state, now);
      expect(isLocked(state, now)).toBe(false);
    }
    state = onLoginFailure(state, now);
    expect(state.failedAttempts).toBe(5);
    expect(isLocked(state, now)).toBe(true);
  });

  it('ロックは15分後に自動解除される', () => {
    const state = onLoginFailure({ failedAttempts: 4, lockedUntil: null }, now);
    expect(isLocked(state, now)).toBe(true);
    const after = new Date(now.getTime() + LOCK_DURATION_MS);
    expect(isLocked(state, after)).toBe(false);
  });

  it('成功でカウンタとロックがリセットされる', () => {
    const state = onLoginSuccess();
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil).toBeNull();
    expect(isLocked(state, now)).toBe(false);
  });
});
