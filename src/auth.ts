import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { v7 as uuidv7 } from 'uuid';

import { loginSchema } from '@/schemas/auth';
import { AppError } from '@/server/services/errors';
import { logger } from '@/server/services/logger';
import { AUTH_RATE_LIMIT, enforceRateLimit } from '@/server/services/rate-limit';
import {
  createUserWithDefaults,
  generateGuestDisplayName,
} from '@/server/usecases/auth/create-user';
import { verifyCredentials } from '@/server/usecases/auth/verify-credentials';

/**
 * Auth.js (NextAuth v5) 設定（docs/14_Authentication_Design.md）。
 * - セッション: JWT戦略。maxAge 30日（スライド）。トークン内で24h境界を検証（DEC-006 / CORE_SPEC §12）
 * - API-002 ログイン / API-003 ログアウト / API-005 ゲスト開始は
 *   Auth.jsの signIn('credentials') / signIn('guest') / signOut で実現する（DEC-246: 29章登録簿参照）
 * - Cookie: Auth.js既定で httpOnly + SameSite=Lax、本番は __Secure- プレフィックス + Secure
 */
/** AppErrorのエラーコードをsignIn応答（res.code）へ伝搬するためのラッパー（Auth.js v5仕様） */
class AuthCodeError extends CredentialsSignin {
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function ipFromRequest(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 最大30日（スライド更新）
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      id: 'credentials',
      name: 'メールアドレスとパスワード',
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;
        const ip = ipFromRequest(request);
        try {
          enforceRateLimit(`auth:login:${ip}`, AUTH_RATE_LIMIT);
          const user = await verifyCredentials(parsed.data.email, parsed.data.password, ip);
          return { id: user.id, isGuest: user.isGuest, role: user.role };
        } catch (err) {
          if (err instanceof AppError) {
            // Auth.jsはauthorizeの例外を握るため、エラーコードをCredentialsSignin.codeで伝搬する
            throw new AuthCodeError(err.errorCode);
          }
          logger.error('authorize_failed', { errorName: (err as Error)?.name });
          throw new AuthCodeError('ERR_INTERNAL');
        }
      },
    }),
    Credentials({
      id: 'guest',
      name: 'ゲストプレイ',
      credentials: {},
      async authorize(_credentials, request) {
        const ip = ipFromRequest(request);
        try {
          enforceRateLimit(`auth:guest:${ip}`, AUTH_RATE_LIMIT);
          const entropy = uuidv7();
          const user = await createUserWithDefaults({
            isGuest: true,
            displayName: generateGuestDisplayName(entropy),
          });
          logger.info('guest_created', { userId: user.id });
          return { id: user.id, isGuest: true, role: user.role };
        } catch (err) {
          if (err instanceof AppError) throw new AuthCodeError(err.errorCode);
          logger.error('guest_create_failed', { errorName: (err as Error)?.name });
          throw new AuthCodeError('ERR_INTERNAL');
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.isGuest = (user as { isGuest?: boolean }).isGuest ?? false;
        token.role = (user as { role?: string }).role ?? 'user';
        token.issuedAtMs = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.userId = token.userId as string;
      session.isGuest = token.isGuest as boolean;
      session.role = token.role as string;
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    userId: string;
    isGuest: boolean;
    role: string;
  }
  interface User {
    isGuest?: boolean;
    role?: string;
  }
}
