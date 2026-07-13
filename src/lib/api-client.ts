// クライアント側のAPIフェッチ共通処理（エラー共通形式 { errorCode, message, ... } の解釈）
export class ApiClientError extends Error {
  readonly errorCode: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(errorCode: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.errorCode = errorCode;
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  let body: { errorCode?: string; message?: string; details?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // JSONでない5xx等はそのまま既定メッセージへ
  }
  throw new ApiClientError(
    body.errorCode ?? 'ERR_INTERNAL',
    body.message ?? '通信に失敗しました。時間をおいてお試しください',
    res.status,
    body.details,
  );
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  return handleResponse<T>(res);
}

export async function apiSend<T>(
  path: string,
  options: { method: 'POST' | 'PUT' | 'DELETE'; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(path, {
    method: options.method,
    credentials: 'same-origin',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return handleResponse<T>(res);
}
