/**
 * ログインロック判定（docs/14 §7: 5回連続失敗で15分ロック）。
 * 純粋関数（現在時刻は引数注入）。DB更新はusecase側が行う。
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** 現在ロック中かどうか */
export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** ログイン失敗時の次状態（5回目の失敗でロック開始） */
export function onLoginFailure(state: LockoutState, now: Date): LockoutState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  }
  return { failedAttempts, lockedUntil: null };
}

/** ログイン成功時の次状態（カウンタ・ロック解除） */
export function onLoginSuccess(): LockoutState {
  return { failedAttempts: 0, lockedUntil: null };
}
