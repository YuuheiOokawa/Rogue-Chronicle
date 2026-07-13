/**
 * エラー共通定義（docs/13_API_Design.md §2 / docs/24 §4）。
 * usecase/domainは AppError を throw し、route handler 側の共通ハンドラ（api.ts）が
 * `{ errorCode, message, details, traceId, timestamp }` 形式へ変換する（DEC-243）。
 */

export const ERROR_DEFS = {
  ERR_AUTH_UNAUTHORIZED: { status: 401, message: '認証が必要です' },
  ERR_AUTH_INVALID_CREDENTIALS: {
    status: 401,
    message: 'メールアドレスまたはパスワードが正しくありません',
  },
  ERR_AUTH_SESSION_EXPIRED: { status: 401, message: 'セッションの有効期限が切れました' },
  ERR_AUTH_LOCKED: {
    status: 423,
    message: 'ログイン試行回数の上限に達しました。しばらく待ってからお試しください',
  },
  ERR_FORBIDDEN: { status: 403, message: 'この操作を行う権限がありません' },
  ERR_VALIDATION: { status: 400, message: '入力内容に誤りがあります' },
  ERR_NOT_FOUND: { status: 404, message: '対象が見つかりません' },
  ERR_CONFLICT_VERSION: {
    status: 409,
    message: 'データが他の操作で更新されています。最新の状態を取得してください',
  },
  ERR_DUPLICATE_REQUEST: { status: 409, message: '同じ操作が処理中または処理済みです' },
  ERR_RUN_STATE_INVALID: { status: 409, message: '冒険の状態と操作が一致しません' },
  ERR_RUN_ALREADY_ACTIVE: { status: 409, message: '進行中の冒険があります' },
  ERR_INVALID_ACTION: { status: 422, message: 'この操作は現在実行できません' },
  ERR_REWARD_ALREADY_CLAIMED: { status: 409, message: 'この報酬は受け取り済みです' },
  ERR_INSUFFICIENT_GOLD: { status: 422, message: 'ゴールドが足りません' },
  ERR_INSUFFICIENT_SHARDS: { status: 422, message: 'ソウルシャードが足りません' },
  ERR_RATE_LIMITED: {
    status: 429,
    message: 'リクエストが多すぎます。しばらく待ってからお試しください',
  },
  ERR_MAINTENANCE: { status: 503, message: 'ただいまメンテナンス中です' },
  ERR_TIMEOUT: { status: 504, message: '処理がタイムアウトしました' },
  ERR_INTERNAL: { status: 500, message: 'サーバーエラーが発生しました' },
} as const;

export type ErrorCode = keyof typeof ERROR_DEFS;

export class AppError extends Error {
  readonly errorCode: ErrorCode;
  readonly status: number;
  /** クライアントへ返してよい追加情報のみ入れる（内部情報・PII禁止） */
  readonly details?: unknown;

  constructor(errorCode: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_DEFS[errorCode].message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.status = ERROR_DEFS[errorCode].status;
    this.details = details;
  }
}

export interface ErrorResponseBody {
  errorCode: ErrorCode;
  message: string;
  details?: unknown;
  traceId: string;
  timestamp: string;
}
