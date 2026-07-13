import { auth } from '@/auth';
import { AppError } from '@/server/services/errors';

export interface SessionUser {
  userId: string;
  isGuest: boolean;
  role: string;
}

/** 認証必須APIの共通ガード。未認証は ERR_AUTH_UNAUTHORIZED(401) */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.userId) {
    throw new AppError('ERR_AUTH_UNAUTHORIZED');
  }
  return { userId: session.userId, isGuest: session.isGuest, role: session.role };
}
