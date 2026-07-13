import { compare } from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';

import { isLocked, onLoginFailure, onLoginSuccess } from '@/domain/progression/login-lockout';
import { AppError } from '@/server/services/errors';
import { logger } from '@/server/services/logger';
import { prisma } from '@/server/services/prisma';

/**
 * メール+パスワードの検証（API-002の中核。Auth.js credentials providerから呼ぶ）。
 * - 5回連続失敗で15分ロック（ERR_AUTH_LOCKED, docs/14 §7）
 * - 失敗理由は外部に区別させない（ユーザー不在/パスワード不一致とも ERR_AUTH_INVALID_CREDENTIALS）
 * - 認証ログ: 成功/失敗/ロックをaudit_logsへ記録（emailは記録しない）
 */
export async function verifyCredentials(email: string, password: string, ip: string) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash || user.status !== 'active') {
    // ユーザー不在でもタイミング差を減らすためダミー比較
    await compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZL4RwRcCrRK8oO0d3dEHzWvS3nW1Gm');
    throw new AppError('ERR_AUTH_INVALID_CREDENTIALS');
  }

  const lockState = { failedAttempts: user.failedAttempts, lockedUntil: user.lockedUntil };
  if (isLocked(lockState, now)) {
    await audit(user.id, 'login_blocked_locked', ip);
    throw new AppError('ERR_AUTH_LOCKED');
  }

  const ok = await compare(password, user.passwordHash);
  if (!ok) {
    const next = onLoginFailure(lockState, now);
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil },
    });
    await audit(user.id, next.lockedUntil ? 'account_locked' : 'login_failed', ip);
    if (next.lockedUntil) {
      logger.warn('account_locked', { userId: user.id });
      throw new AppError('ERR_AUTH_LOCKED');
    }
    throw new AppError('ERR_AUTH_INVALID_CREDENTIALS');
  }

  const reset = onLoginSuccess();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedAttempts: reset.failedAttempts,
      lockedUntil: reset.lockedUntil,
      lastAccessAt: now,
    },
  });
  await audit(user.id, 'login_success', ip);
  return user;
}

async function audit(userId: string, action: string, ip: string): Promise<void> {
  await prisma.auditLog.create({
    data: { id: uuidv7(), userId, action, ip },
  });
}
