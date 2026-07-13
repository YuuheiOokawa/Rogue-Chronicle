/**
 * 構造化JSONロガー（docs/23_Logging_Monitoring.md）。
 * 禁止事項: パスワード・トークン・セッションID・メールアドレス・Cookieを出力しない。
 * ユーザー識別は userId（UUID）のみ。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  traceId?: string;
  userId?: string;
  apiId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const FORBIDDEN_KEYS = /password|token|secret|cookie|email|authorization/i;

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = FORBIDDEN_KEYS.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitize(fields),
  };
  // Vercel Logsが一次ログ（DEC-020）。console出力のみでよい
  console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
