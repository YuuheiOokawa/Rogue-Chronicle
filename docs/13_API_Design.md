# 13. API設計書 — Rogue Chronicle

- 文書ID: DOC-13
- 目的: ローグライトRPG「Rogue Chronicle」の全API（API-001〜API-604）について、方式選定・共通仕様・サーバー権威設計・各APIの詳細仕様を定義し、実装（Next.js Route Handlers）とテストの単一基準とする。
- 前提: CORE_SPEC（設計共通仕様）§5〜§8 と完全一致。API ID・エンドポイント・エラーコード・テーブル名・画面IDはCORE_SPECを唯一の正とする。
- 関連文書: 05_Game_Design.md / 09_Screen_Design.md / 11_Module_Design.md / 12_Database_Design.md / 15_Save_Data_Design.md / 18_Skill_Design.md

---

## 1. API方式の選定（DEC-014）

### 1.1 比較表

| 観点 | REST（Route Handlers, /api/v1） | Server Actions | RPC（tRPC） |
|---|---|---|---|
| 型安全性 | 中〜高。Zodスキーマを`src/schemas/`に集約し、`z.infer`でリクエスト/レスポンス型を共有すれば実用上十分 | 高。関数呼び出しなので引数・戻り値が自動で型付く | 高。エンドツーエンドで型推論が効く |
| キャッシュ | 高。GETにHTTPセマンティクス（Cache-Control, ETag）が使える。TanStack Queryとの相性も素直 | 低。全てPOSTでHTTPキャッシュ不可。再検証はNext.js独自機構に依存 | 中。GET化は可能だがHTTPキャッシュ活用には工夫が要る |
| 学習コスト | 低。HTTP+JSONの標準知識のみ。デバッグもcurl/ブラウザDevToolsで完結 | 中。Next.js固有の実行モデル（シリアライズ制約、プログレッシブエンハンスメント）の理解が必要 | 中〜高。tRPC独自の概念（router/procedure/link）とバージョン追従コスト |
| モバイルアプリ化時の再利用 | 高。将来のネイティブ/PWA化でもHTTPクライアントからそのまま呼べる | 不可。Next.jsのReactツリーに結合しており外部クライアントから呼べない | 低〜中。TypeScriptクライアント限定。Swift/Kotlinネイティブからは実質使えない |
| テスト容易性 | 高。Route Handlerは`Request→Response`の純関数に近く、supertest的な統合テストやPlaywright APIテストが容易 | 中。フォーム/RSCコンテキストのモックが必要 | 中。tRPCテストユーティリティに依存 |

### 1.2 結論（DEC-014・CORE_SPEC §2と一致）

- **REST（Next.js Route Handlers、ベースパス `/api/v1`）を採用する。**
- 採用理由:
  1. 本作は将来PWA・ネイティブ化を明示的に見据えており（CORE_SPEC §1）、Next.jsに結合しないAPI面が必須。
  2. ゲームAPIはGET（状態取得・再開）とPOST（選択送信）の役割が明確で、HTTPセマンティクス（キャッシュ、429/Retry-After、Idempotency-Key）をそのまま活かせる。
  3. サーバー権威（DEC-007）の検証・監査には「HTTPリクエスト単位でログ・レート制限・トレースIDを貼れる」ことが重要で、RESTが最も透過的。
  4. 個人開発のため学習・保守コストの低さを優先。tRPCのバージョン追従リスクを避ける。
- **Server Actionsは認証系フォーム（SCR-003 ログイン / SCR-004 新規登録）のみ限定利用可**とする。理由: Auth.js(NextAuth v5)の`signIn`/`signOut`ヘルパーがServer Actionsと親和的であり、プログレッシブエンハンスメントの恩恵がある唯一の箇所のため。ただしその場合もAPI-001/002/003のRESTエンドポイントは維持し、Server Actionsは内部で同一のユースケース関数（`server/usecases/auth/*`）を呼ぶ二重口とする（ロジックの重複禁止）。
- tRPCは不採用。ゲームロジックAPI（ラン系）にServer Actionsを使うことも禁止する。

---

## 2. 共通仕様

### 2.1 ベースパスとバージョニング

- ベースパス: **`/api/v1`**（CORE_SPEC §7）。実体は `src/app/api/v1/**/route.ts`。
- 後方互換を壊す変更が必要になった場合のみ `/api/v2` を新設する。MVP期間中はv1のみ。
- Content-Type: リクエスト/レスポンスとも `application/json; charset=utf-8` 固定。JSON以外のContent-Typeを持つ変更系リクエストは `ERR_VALIDATION` (400) で拒否する（CSRF対策を兼ねる。§2.3）。

### 2.2 認証方式（DEC-006と一致）

- Auth.js（NextAuth v5）のJWT戦略によるセッションCookieを用いる。
- Cookie属性: **httpOnly + Secure + SameSite=Lax**。Cookie名は `__Host-rc.session-token`（仮決定 DEC-021。`__Host-`プレフィックスでPath=/・Secure・ドメイン固定を強制）。
- 有効期限: アクセストークン24時間、スライディング更新で最大30日（CORE_SPEC §12）。失効管理は `auth_sessions` テーブルで行う（強制ログアウト・退会時の無効化用）。
- ゲストアカウント: API-005で `users.is_guest = true` のユーザーを発行し、同一のセッションCookieを付与する。ゲストも認証済みユーザーとして扱う（権限区分は§2.4）。
- 認証必須APIでセッションが無い/期限切れの場合は `ERR_AUTH_UNAUTHORIZED` / `ERR_AUTH_SESSION_EXPIRED`（いずれも401）を返す。リダイレクトはAPI層では行わない（クライアント側でSCR-002/SCR-003へ誘導）。

### 2.3 CSRF対策

多層で防御する。

1. **SameSite=Lax Cookie**: クロスサイトのPOSTにCookieが付かないことを第一の防壁とする。
2. **Originヘッダ検証**: `/api/v1` の全変更系メソッド（POST/PUT/DELETE）で、`Origin`（無ければ`Referer`）が自サイトのオリジンと一致することをmiddlewareで検証。不一致は `ERR_FORBIDDEN` (403)。
3. **Content-Type検証**: `application/json` 以外の変更系リクエストを拒否（HTMLフォームからの単純リクエストを遮断）。
4. 認証フォームにServer Actionsを使う場合はAuth.js組み込みのCSRFトークン検証をそのまま利用する。

CORSは同一オリジン運用のため許可ヘッダを付与しない（プリフライトに応答しない）。将来ネイティブアプリ化時にCORS/トークン認証を再設計する（→未決事項 ISSUE-131）。

### 2.4 権限区分

| 区分 | 定義 | 備考 |
|---|---|---|
| ゲスト | `users.is_guest = true` の認証済みユーザー | ほぼ全ゲームAPIを利用可。API-006（引き継ぎ）はゲスト専用 |
| 一般 | メール/パスワード登録済みユーザー | API-006は利用不可（`ERR_FORBIDDEN`） |
| 管理者 | `users.role = 'admin'`（仮決定 DEC-022） | MVPでは管理画面なし（DEC-013）。管理APIは土台（roleチェック共通関数）のみ用意し、エンドポイントは公開しない |

### 2.5 共通リクエストヘッダ

| ヘッダ | 必須 | 説明 |
|---|---|---|
| `Content-Type: application/json` | 変更系で必須 | §2.1 |
| `Idempotency-Key` | ラン系変更API（API-303, 305, 306, 307, 402, 502〜508）で**必須** | UUIDv4。クライアントが操作1回ごとに生成。再送時は同一キーを使う。詳細は§2.10 |
| `X-Client-Version` | 任意 | クライアントビルドのバージョン。互換性警告・ログ用 |

### 2.6 共通レスポンスヘッダ

| ヘッダ | 付与条件 | 説明 |
|---|---|---|
| `X-Trace-Id` | 全レスポンス | リクエスト単位のUUIDv4。構造化ログ（DEC-020）と突合する |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` | 全レスポンス | §2.11のレート制限状態 |
| `Retry-After` | 429 / 503 | 再試行可能になるまでの秒数 |

### 2.7 共通エラーレスポンス形式

全エラーは以下のJSONで返す（CORE_SPEC §7と完全一致）。

```jsonc
{
  "errorCode": "ERR_CONFLICT_VERSION",       // ERR_大分類_詳細（CORE_SPEC §3のID体系）
  "message": "ラン状態が他の操作により更新されています。最新状態を再取得してください。", // ユーザー提示可能な日本語
  "details": { "expectedVersion": 12, "actualVersion": 13 }, // 任意。フィールドエラー配列や競合情報
  "traceId": "b3e1c9f2-6a1d-4e7a-9c1f-2d8e5a7b4c3d",
  "timestamp": "2026-07-12T09:30:00.000Z"    // ISO 8601 UTC
}
```

- `details` はエラーコードごとに構造を定める（各API仕様および§2.8参照）。`ERR_VALIDATION` の場合は `details.issues: [{ path, message }]`（Zodの`issues`を整形）。
- 成功レスポンスはエンベロープなしでリソースを直接返す（仮決定 DEC-023）。`traceId`は成功時ヘッダ`X-Trace-Id`のみで返す。

### 2.8 HTTPステータス対応表

| HTTPステータス | 用途 | 対応エラーコード |
|---|---|---|
| 200 OK | 取得・更新成功 | — |
| 201 Created | リソース作成成功（API-001, 005, 303） | — |
| 400 Bad Request | 形式不正（Zod検証失敗、JSON構文エラー、ヘッダ欠落） | ERR_VALIDATION |
| 401 Unauthorized | 未認証・認証失敗・セッション切れ | ERR_AUTH_UNAUTHORIZED, ERR_AUTH_INVALID_CREDENTIALS, ERR_AUTH_SESSION_EXPIRED |
| 403 Forbidden | 権限なし・Origin不一致 | ERR_FORBIDDEN |
| 404 Not Found | リソース・ルート不存在 | ERR_NOT_FOUND |
| 409 Conflict | 状態競合 | ERR_CONFLICT_VERSION, ERR_DUPLICATE_REQUEST, ERR_RUN_STATE_INVALID, ERR_RUN_ALREADY_ACTIVE, ERR_REWARD_ALREADY_CLAIMED |
| 422 Unprocessable Entity | 形式は正しいがゲームルール上不正 | ERR_INVALID_ACTION, ERR_INSUFFICIENT_GOLD, ERR_INSUFFICIENT_SHARDS |
| 423 Locked | ログイン試行超過ロック | ERR_AUTH_LOCKED |
| 429 Too Many Requests | レート制限 | ERR_RATE_LIMITED |
| 500 Internal Server Error | 未捕捉例外 | ERR_INTERNAL |
| 503 Service Unavailable | メンテナンス中 | ERR_MAINTENANCE |
| 504 Gateway Timeout | 処理タイムアウト | ERR_TIMEOUT |

### 2.9 エラーコード定義表（CORE_SPEC §7の全コード）

| errorCode | HTTP | 発生条件 | クライアント側の推奨挙動 |
|---|---|---|---|
| ERR_AUTH_UNAUTHORIZED | 401 | セッションCookieなし/無効で認証必須APIを呼んだ | タイトル画面（SCR-002）へ遷移しログイン導線を表示 |
| ERR_AUTH_INVALID_CREDENTIALS | 401 | ログイン時のメール/パスワード不一致（どちらが誤りかは秘匿） | SCR-003でエラー表示。残り試行回数は表示しない |
| ERR_AUTH_SESSION_EXPIRED | 401 | セッション有効期限切れ（最大30日超過・失効済み） | 「セッションが切れました」トースト→SCR-003へ。入力中データはローカル保持 |
| ERR_AUTH_LOCKED | 423 | ログイン5回連続失敗による15分ロック中（CORE_SPEC §12） | ロック解除時刻（details.lockedUntil）を表示し再試行を抑止 |
| ERR_FORBIDDEN | 403 | 権限不足（例: 一般ユーザーがAPI-006）、Origin検証失敗 | 操作をブロックし前画面へ戻す。再送しない |
| ERR_VALIDATION | 400 | Zodスキーマ違反、JSON不正、Idempotency-Key欠落/形式不正 | details.issuesをフォームエラーに割当。ゲーム内なら「通信データ不正」ダイアログ。再送しない（バグ扱いでログ送出） |
| ERR_NOT_FOUND | 404 | 対象リソース不存在（例: 存在しないcharacterId、アクティブランなしで/runs/current系） | ラン系なら「ランが存在しません」→SCR-101へ。一覧はリロード |
| ERR_CONFLICT_VERSION | 409 | 楽観ロック競合（送信versionとDBのversion不一致） | **自動再送禁止**。GET /runs/current で最新状態を取得しUIを再同期後、ユーザーに再操作させる |
| ERR_DUPLICATE_REQUEST | 409 | 同一Idempotency-Keyで**異なる内容**のリクエストを受信 | バグ扱い。最新状態を再取得。キーの使い回しをやめる |
| ERR_RUN_STATE_INVALID | 409 | run_stateのphase/positionと矛盾する操作（例: phase=battle中にノード選択） | GET /runs/current で再同期し、phaseに対応する画面へ強制遷移 |
| ERR_RUN_ALREADY_ACTIVE | 409 | アクティブラン存在中にAPI-303を呼んだ | 「進行中の挑戦があります」ダイアログ→再開（SCR-301等）or リタイア導線 |
| ERR_INVALID_ACTION | 422 | ルール上不正な選択（未所持スキル、SP不足、死亡対象への攻撃、非隣接ノード、逃走不可戦闘での逃走等） | details.reasonを表示。選択UIを最新状態で再描画。再送しない |
| ERR_REWARD_ALREADY_CLAIMED | 409 | 受領済み報酬の再受領（finalize二重実行、宝箱二重開封等） | 受領済みとして結果画面を閉じ、最新状態を再取得 |
| ERR_INSUFFICIENT_GOLD | 422 | ショップ購入等でゴールド不足 | 「ゴールドが足りません」表示。購入UIの押下制御を見直す |
| ERR_INSUFFICIENT_SHARDS | 422 | キャラ解放・永続強化でソウルシャード不足 | 不足額（details.required, details.current）を表示 |
| ERR_RATE_LIMITED | 429 | §2.11の制限超過 | Retry-After秒待って自動再試行（最大1回）。連打UIを無効化 |
| ERR_MAINTENANCE | 503 | maintenance_settingsが有効 | SCR-009（メンテナンス画面）へ遷移。details.endsAtがあれば表示 |
| ERR_TIMEOUT | 504 | サーバー処理が10秒を超過 | §2.13のリトライ指針に従う（変更系は同一Idempotency-Keyで1回再送可） |
| ERR_INTERNAL | 500 | 未捕捉例外 | SCR-010（通信エラー画面）。traceIdを添えて問い合わせ導線 |

### 2.10 冪等性（Idempotency-Key）規約

- 対象: ラン系変更API **API-303, 305, 306, 307, 402, 502, 503, 504, 505, 506, 507, 508**（CORE_SPEC §7補足と一致）。
- クライアントは操作1回につきUUIDv4を生成して送る。タイムアウト・通信断での再送時は**同一キー・同一ボディ**で再送する。
- サーバー実装（仮決定 DEC-024）: 専用テーブルは追加せず、`dungeon_runs.run_state` 内に直近の受理記録を保持する。
  - 受理時に `run_state.lastRequest = { key, apiId, bodyHash, response }` を状態更新と同一UPDATE（同一トランザクション）で書き込む。
  - 同一キー再受信時: `bodyHash` 一致なら保存済み `response` をそのまま200で再返却（副作用なし）。`bodyHash` 不一致なら `ERR_DUPLICATE_REQUEST` (409)。
  - ラン操作はユーザー内で直列（1アクティブラン・1操作ずつ）のため直近1件の保持で十分。
  - API-303のみラン作成前でrun_stateが無いため、`dungeon_runs` に `created_idempotency_key` 列を持ち、同一ユーザー×同一キーの既存ランがあればそれを201で再返却する。
- ヘッダ欠落・UUID形式不正は `ERR_VALIDATION` (400)。

### 2.11 レート制限

| バケット | 制限 | キー | 対象API |
|---|---|---|---|
| auth | **5回/分/IP** | クライアントIP（`x-forwarded-for`先頭） | API-001, 002, 005, 006, 007 |
| general | **60回/分/ユーザー** | userId | 認証必須の全API |

- 超過時は `ERR_RATE_LIMITED` (429) + `Retry-After`。
- 実装（仮決定 DEC-025）: MVPは固定ウィンドウカウンタをサーバーレス関数内のインメモリLRUで持つベストエフォート方式（インスタンス毎に独立するため実効値は緩む）。ログイン試行ロック（5回失敗で15分、CORE_SPEC §12）は `users` の失敗カウンタ/ロック時刻列でDB上厳密に管理し、これが認証系の実質的な防壁となる。将来Upstash Redis等で厳密化（→ISSUE-132）。
- 全レスポンスに `X-RateLimit-*` ヘッダを付与する（§2.6）。

### 2.12 ページネーション規約

- カーソル方式（仮決定 DEC-026）。クエリ: `?limit=20&cursor=<opaque>`（limit最大50、既定20）。
- レスポンス形: `{ "items": [...], "nextCursor": "..." | null }`。`nextCursor=null` が最終ページ。
- MVPで対象となるのは API-104（お知らせ）のみ。API-106/201/301/601等は件数が小さい（実績10・キャラ3・ダンジョン1・図鑑数十件）ため全件返却とするが、レスポンス形は将来のページング追加に備え同じ `{ items }` 形を用いる。

### 2.13 タイムアウトとリトライ指針

- サーバー: 全APIの処理タイムアウトは**10秒**（Vercel関数上限内、CORE_SPEC §12）。超過時は `ERR_TIMEOUT` (504)。
- クライアント（TanStack Query設定の基準）:
  1. **GET**: ネットワークエラー/5xx/504は指数バックオフ（1s→2s）で最大2回自動リトライ可。
  2. **変更系（Idempotency-Key付き）**: タイムアウト・ネットワークエラー時のみ、**同一キー・同一ボディ**で最大1回自動再送可。サーバー側冪等性により二重適用されない。
  3. **429**: `Retry-After` 秒待機後に1回のみ再送。
  4. **409（ERR_CONFLICT_VERSION / ERR_RUN_STATE_INVALID）**: 自動再送禁止。`GET /runs/current` で再同期。
  5. **400/403/422**: 再送禁止（同じ結果になる）。

---

## 3. サーバー権威の設計（最重要・DEC-007）

### 3.1 原則

- **クライアントは「選択」のみを送信する。** 例: 行動の種類と対象（`actionType` + `targetIndex`）、進むノードのID（`nodeId`）、スキル3択の添字（`index`）。
- **クライアントからダメージ値・報酬内容・乱数結果・ステータス値を絶対に受け取らない。** これらのフィールドがリクエストに含まれていてもZodの `.strict()` で拒否する。
- サーバーは `dungeon_runs.run_state` + `seed` + PRNGカーソル（`run_state.rngCursor`）から**全計算**（ダメージ・命中・クリティカル・敵AI・抽選）を行い、「結果（ログ）」と「新しい状態」を返す。
- 乱数はシード付きPRNG（mulberry32相当、DEC-019）。`seed` はAPI-303でサーバーが生成した32bit値、`rngCursor` は消費回数。同一seed+同一カーソル+同一入力列から結果を完全再現でき、チート検証・バグ再現に使う。乱数消費のたびにカーソルを進めて状態と一緒に保存する。

### 3.2 バリデーションの多層構造

全ラン系変更APIは以下の順で検証する。どの層で失敗したかがエラーコードに対応する。

| 層 | 内容 | 実装 | 失敗時 |
|---|---|---|---|
| 1. 形式検証 | Zodスキーマ（`src/schemas/`）。`.strict()`で未知キー拒否。Idempotency-Key形式 | Route Handler入口 | ERR_VALIDATION (400) |
| 2. 認証・所有権 | セッション検証、対象ラン/リソースが自分のものか | `server/services/auth` | ERR_AUTH_* (401) / ERR_FORBIDDEN (403) / ERR_NOT_FOUND (404) |
| 3. run_state整合性 | `validateRunState`: phaseが操作に適合するか、選択が現在状態で正当か（隣接ノードか、スキル所持か、SP残量、対象生存、choicesに含まれるindexか） | `domain/*` の純関数 | ERR_RUN_STATE_INVALID (409) / ERR_INVALID_ACTION (422) |
| 4. 楽観ロック | `UPDATE dungeon_runs SET run_state=?, version=version+1 WHERE id=? AND version=:sentVersion`。更新0行なら競合（DEC-011） | `server/repositories/runRepository` | ERR_CONFLICT_VERSION (409) |
| 5. 冪等キー | §2.10。同一キーは保存済みレスポンス再返却 | `server/services/idempotency` | （再返却）/ ERR_DUPLICATE_REQUEST (409) |

- 楽観ロックの `version` はリクエストボディの必須フィールド `version`（number）でクライアントから送らせる。クライアントは常に直近レスポンスの `run.version` を保持して送る。
- 層3のドメイン検証は `src/domain/` の純関数（Next.js/Prisma非依存）で行い、ユニットテスト可能にする。

### 3.3 応答に含める状態（RunView投影）

- サーバー保存形の `run_state` をそのまま返さず、**クライアント公開用の投影（RunView）** に変換して返す（仮決定 DEC-027）。除外するもの:
  - 未踏破階層の隠し情報（SECRETノードの正体、EVENTの結果テーブル）
  - `rngCursor`・`lastRequest`（内部管理値）
  - 敵の内部AIステート（行動予告 `intent` のみ公開する）
- 全変更系レスポンスは `{ result: <API固有の結果>, run: { runId, version, state: RunView } }` の形とし、クライアントは受信した `run` でローカル状態（Zustand/TanStack Queryキャッシュ）を全置換する。差分適用はしない（不整合の芽を断つ）。

### 3.4 チート対策の考え方（AntiCheatModule）

- 不正リクエスト（層3で弾かれたERR_INVALID_ACTION等）は構造化ログにuserId・traceId付きで記録し、頻発ユーザーを検知可能にする（DEC-020の範囲内、error_logsテーブルは作らない）。
- リザルト確定（API-307）時に `seed` + `battle_logs` から獲得値の再検算が可能な構造を保つ（MVPでは記録のみ、検算バッチは将来）。

---

## 4. API詳細仕様

表記について:
- 「権限」列は ゲスト/一般/管理者 の利用可否。
- 「Zodルール」は `src/schemas/` に配置するスキーマの要点。全て `.strict()` 前提。
- 「処理概要」の関数名は CORE_SPEC §9 の `src/domain/`・`src/server/usecases/` の関数。
- レート制限は特記なき場合 general（60回/分/ユーザー）。認証系は auth（5回/分/IP）。

### 4.1 認証系（/auth）

#### API-001 ユーザー登録

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/register` |
| 認証 | 不要 |
| 権限 | ゲスト:○（未ログイン状態から） / 一般:×（登録済み） / 管理者:× |
| 冪等性 | 不要（emailユニーク制約で二重登録は409相当→ERR_VALIDATIONで返す） |
| レート制限 | auth 5回/分/IP |
| 関連画面 | SCR-004 |
| 関連テーブル | users, user_profiles, user_settings, player_progress, player_currencies, player_characters, auth_sessions |
| Tx境界 | users〜player_characters初期レコード作成を1トランザクション。セッション発行はTx外 |

リクエスト:
```jsonc
{ "email": "player@example.com", "password": "P@ssw0rd123", "displayName": "レイン推し" }
```
レスポンス（201）:
```jsonc
{ "userId": "usr_01J...", "displayName": "レイン推し", "isGuest": false }
```
バリデーション（Zod）:
```ts
const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72)
    .regex(/[a-zA-Z]/).regex(/[0-9]/), // 英字+数字を各1文字以上
  displayName: z.string().min(1).max(20),
}).strict();
```
処理概要:
1. Zod検証 → メール正規化（小文字化）。
2. email重複チェック（ユニーク制約違反は `ERR_VALIDATION` + `details.issues=[{path:["email"],message:"既に使用されています"}]`）。
3. パスワードをbcrypt（cost=12）でハッシュ化。
4. Tx内で users / user_profiles / user_settings / player_progress（rank=1）/ player_currencies（soul_shards=0）/ player_characters（swordsman_rain 初期解放, CORE_SPEC §5.5）を作成。
5. Auth.jsセッション発行（auth_sessions記録）、Set-Cookie。

エラー: ERR_VALIDATION / ERR_RATE_LIMITED / ERR_MAINTENANCE / ERR_INTERNAL

#### API-002 ログイン

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/login` |
| 認証 | 不要 |
| 権限 | 全区分（登録済み資格情報を持つ者） |
| 冪等性 | 不要（自然冪等） |
| レート制限 | auth 5回/分/IP + アカウント単位5回失敗で15分ロック |
| 関連画面 | SCR-003 |
| 関連テーブル | users, auth_sessions |
| Tx境界 | 失敗カウンタ更新とセッション発行はそれぞれ単文更新 |

リクエスト:
```jsonc
{ "email": "player@example.com", "password": "P@ssw0rd123" }
```
レスポンス（200）:
```jsonc
{ "userId": "usr_01J...", "displayName": "レイン推し", "isGuest": false }
```
バリデーション（Zod）: `z.object({ email: z.string().email().max(254), password: z.string().min(1).max(72) }).strict()`

処理概要:
1. Zod検証。
2. usersからemailで検索。ロック中（lockedUntil>now）なら `ERR_AUTH_LOCKED` + `details.lockedUntil`。
3. bcrypt照合。失敗時は失敗カウンタ+1（5回で15分ロック設定）、`ERR_AUTH_INVALID_CREDENTIALS`。ユーザー不存在時も同一応答・同等応答時間（列挙攻撃対策）。
4. 成功時: 失敗カウンタリセット、auth_sessionsにセッション記録、JWTセッションCookie発行。

エラー: ERR_VALIDATION / ERR_AUTH_INVALID_CREDENTIALS / ERR_AUTH_LOCKED / ERR_RATE_LIMITED / ERR_MAINTENANCE / ERR_INTERNAL

#### API-003 ログアウト

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/logout` |
| 認証 | 要 |
| 権限 | ゲスト:○ / 一般:○ / 管理者:○ |
| 冪等性 | 自然冪等（複数回呼んでも同結果） |
| 関連画面 | SCR-116 |
| 関連テーブル | auth_sessions |
| Tx境界 | 単文（セッション失効） |

リクエスト: ボディなし（`{}` 可）。
レスポンス（200）: `{ "ok": true }`
処理概要: 1. セッション検証 → 2. auth_sessionsの該当セッションを失効 → 3. Cookie削除（Max-Age=0）。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-004 自分の情報取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/auth/me` |
| 認証 | 要 |
| 権限 | ゲスト:○ / 一般:○ / 管理者:○ |
| 冪等性 | GET（自然冪等） |
| 関連画面 | SCR-001（起動時セッション確認）, SCR-102 |
| 関連テーブル | users, user_profiles |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{ "userId": "usr_01J...", "displayName": "レイン推し", "isGuest": false, "email": "player@example.com", "createdAt": "2026-07-01T00:00:00.000Z" }
```
※ゲストの場合 `email: null`。
処理概要: 1. セッション検証 → 2. users+user_profiles取得 → 3. 返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_AUTH_SESSION_EXPIRED / ERR_INTERNAL

#### API-005 ゲスト開始

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/guest` |
| 認証 | 不要 |
| 権限 | 未ログインのみ |
| 冪等性 | 不要（連打はレート制限で抑止） |
| レート制限 | auth 5回/分/IP |
| 関連画面 | SCR-005 |
| 関連テーブル | users（is_guest=true）ほかAPI-001と同じ初期レコード群 |
| Tx境界 | API-001と同様に初期レコード作成を1トランザクション |

リクエスト: `{ "displayName": "名無しの冒険者" }`（省略時サーバーが既定名生成）
```ts
const guestSchema = z.object({ displayName: z.string().min(1).max(20).optional() }).strict();
```
レスポンス（201）: `{ "userId": "usr_01J...", "displayName": "名無しの冒険者", "isGuest": true }`

処理概要: 1. Zod検証 → 2. is_guest=trueでusers作成+初期レコード群（API-001手順4と同一関数 `createInitialPlayerData`）→ 3. セッション発行。
エラー: ERR_VALIDATION / ERR_RATE_LIMITED / ERR_MAINTENANCE / ERR_INTERNAL

#### API-006 ゲスト引き継ぎ

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/link` |
| 認証 | 要（**ゲストのみ**） |
| 権限 | ゲスト:○ / 一般:× (ERR_FORBIDDEN) / 管理者:× |
| 冪等性 | 不要（is_guest=falseへの一方向遷移で二重実行は403になる） |
| レート制限 | auth 5回/分/IP |
| 関連画面 | SCR-006 |
| 関連テーブル | users, auth_sessions |
| Tx境界 | users更新+旧セッション以外の失効を1トランザクション |

リクエスト:
```jsonc
{ "email": "player@example.com", "password": "P@ssw0rd123" }
```
レスポンス（200）: `{ "userId": "usr_01J...", "displayName": "名無しの冒険者", "isGuest": false }`

処理概要:
1. Zod検証（API-001と同じemail/passwordルール）。
2. セッションユーザーが `is_guest=true` であること（違えば `ERR_FORBIDDEN`）。
3. email重複チェック。
4. Tx内で該当usersにemail/パスワードハッシュを設定し `is_guest=false` へ更新。**ゲームデータ（player_*、dungeon_runs）はuserIdごと引き継がれるため移行処理は不要**。
5. 他デバイスの既存セッションを失効（現セッションは維持）。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_FORBIDDEN / ERR_RATE_LIMITED / ERR_INTERNAL

#### API-007 パスワード再設定要求/確定（△将来・メール基盤要）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/auth/password-reset`（要求） / POST `/api/v1/auth/password-reset/confirm`（確定） |
| 認証 | 不要 |
| 権限 | 一般のみ（ゲストはメール未登録のため対象外） |
| 冪等性 | 要求: 自然冪等（常に同一の匿名応答）/ 確定: トークン一回性で担保 |
| レート制限 | auth 5回/分/IP |
| 関連画面 | SCR-003（導線のみ。MVPでは非表示） |
| 関連テーブル | password_reset_tokens（将来）, users |
| Tx境界 | 確定時: トークン消費+パスワード更新+全セッション失効を1トランザクション |

リクエスト（要求）: `{ "email": "player@example.com" }` → レスポンス（200）: `{ "ok": true }`（アカウント有無に関わらず同一応答）
リクエスト（確定）: `{ "token": "prt_...", "newPassword": "NewP@ss123" }` → レスポンス（200）: `{ "ok": true }`
処理概要（確定）: 1. トークン検証（有効期限30分・未使用）→ 2. パスワード更新 → 3. トークン消費・全auth_sessions失効。
エラー: ERR_VALIDATION / ERR_NOT_FOUND（確定時の無効トークン）/ ERR_RATE_LIMITED / ERR_INTERNAL
※MVPでは実装しない（CORE_SPEC §11）。ルートは予約のみ。

#### API-008 退会

| 項目 | 内容 |
|---|---|
| メソッド/パス | DELETE `/api/v1/auth/account` |
| 認証 | 要 |
| 権限 | ゲスト:○ / 一般:○ / 管理者:○ |
| 冪等性 | 自然冪等（削除済みなら401になる） |
| 関連画面 | SCR-116 |
| 関連テーブル | users および全player_*、dungeon_runs、auth_sessions（CASCADE削除）、audit_logs（削除記録） |
| Tx境界 | 論理削除フラグ設定+全セッション失効を1トランザクション。物理削除は日次バッチ（仮決定 DEC-028: 7日間の猶予後に物理削除、期間中の復帰導線はMVPでは持たない） |

リクエスト:
```jsonc
{ "confirm": "DELETE" }
```
```ts
const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") }).strict();
```
レスポンス（200）: `{ "ok": true }`
処理概要: 1. セッション検証 → 2. Tx内でusers.deleted_at設定+auth_sessions全失効+audit_logs記録 → 3. Cookie削除。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

### 4.2 ホーム・プレイヤー系

#### API-101 ホーム情報取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/home` |
| 認証 | 要 |
| 権限 | ゲスト:○ / 一般:○ / 管理者:○ |
| 冪等性 | GET |
| 関連画面 | SCR-101 |
| 関連テーブル | player_progress, player_currencies, dungeon_runs, announcements, player_achievements |
| Tx境界 | 読み取りのみ（並列SELECT） |

レスポンス（200）:
```jsonc
{
  "player": { "displayName": "レイン推し", "rank": 8, "rankExp": 3200, "rankExpToNext": 4181 },
  "currencies": { "soulShards": 1250 },
  "activeRun": { "exists": true, "dungeonCode": "forgotten_ruins", "floor": 3, "characterCode": "swordsman_rain", "updatedAt": "2026-07-12T09:00:00.000Z" },
  "latestAnnouncements": [ { "id": 12, "title": "v0.3を公開しました", "publishedAt": "2026-07-10T00:00:00.000Z" } ],
  "newAchievementCount": 1
}
```
処理概要: 1. セッション検証 → 2. player_progress/player_currencies/アクティブdungeon_runs（status=active）/公開中announcements上位3件/未確認実績数を取得 → 3. 集約して返却（ホーム1画面=1リクエスト）。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-102 プレイヤー情報取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/player` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-102 |
| 関連テーブル | player_progress, user_profiles, player_achievements |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{
  "displayName": "レイン推し", "rank": 8, "rankExp": 3200, "rankExpToNext": 4181,
  "stats": { "totalRuns": 24, "clears": 3, "bestFloor": 10, "totalKills": 310, "totalPlaySeconds": 43200 },
  "unlockedAchievements": 6, "totalAchievements": 10
}
```
※ `rankExpToNext` は `expToRank(R) = 100 × R^1.8`（CORE_SPEC §5.9）による計算値。
処理概要: 1. セッション検証 → 2. player_progressの統計とprofile取得 → 3. 返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-103 所持通貨取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/player/currencies` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-101, SCR-106, SCR-104（ヘッダ常時表示の再取得用） |
| 関連テーブル | player_currencies |
| Tx境界 | 読み取りのみ |

レスポンス（200）: `{ "soulShards": 1250 }`
処理概要: 1. セッション検証 → 2. player_currencies取得 → 3. 返却。ゴールドはラン内通貨のためここには含めない（RunView側）。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-104 お知らせ取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/announcements?limit=20&cursor=...` |
| 認証 | 不要 |
| 権限 | 未ログイン含む全員 |
| 冪等性 | GET。`Cache-Control: public, max-age=60` を付与 |
| 関連画面 | SCR-115 |
| 関連テーブル | announcements |
| Tx境界 | 読み取りのみ |

バリデーション（Zod、クエリ）: `z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(200).optional() })`
レスポンス（200）:
```jsonc
{ "items": [ { "id": 12, "title": "v0.3を公開しました", "body": "……", "publishedAt": "2026-07-10T00:00:00.000Z" } ], "nextCursor": null }
```
処理概要: 1. クエリ検証 → 2. 公開中（published_at<=now かつ 非削除）を新しい順にカーソル取得 → 3. 返却。
エラー: ERR_VALIDATION / ERR_INTERNAL

#### API-105 ミッション取得（×将来）

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/missions` / 認証: 要 / MVP: 実装しない |
| 関連画面 | SCR-112（将来） / 関連テーブル: missions, player_missions（将来） |

MVPではルート自体を配置しない（404）。将来 `{ items: [{ code, title, progress, goal, rewardShards, claimed }] }` 形を予定。

#### API-106 実績取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/achievements` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-111 |
| 関連テーブル | achievements, player_achievements |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{
  "items": [
    { "code": "total_runs_10", "name": "歴戦の挑戦者", "description": "累計10回ランに挑戦する", "unlocked": true, "unlockedAt": "2026-07-05T12:00:00.000Z", "progress": 24, "goal": 10 },
    { "code": "first_clear", "name": "遺跡踏破", "description": "忘却の遺跡をクリアする", "unlocked": true, "unlockedAt": "2026-07-08T13:00:00.000Z", "progress": 3, "goal": 1 }
  ]
}
```
処理概要: 1. セッション検証 → 2. achievementsマスタ（MVP10件）とplayer_achievementsを外部結合 → 3. 返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

### 4.3 キャラクター・永続強化系

#### API-201 キャラクター一覧取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/characters` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-104, SCR-204 |
| 関連テーブル | characters, player_characters |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{
  "items": [
    { "code": "swordsman_rain", "name": "レイン", "type": "剣士・バランス", "element": "fire",
      "baseStats": { "maxHp": 100, "atk": 12, "def": 10, "spd": 10, "critRate": 5 },
      "uniqueAbility": { "name": "不屈", "description": "ラン中1回、致死ダメージをHP1で耐える" },
      "unlocked": true, "unlockCondition": null },
    { "code": "mage_lilia", "name": "リリア", "type": "魔導士・スキル攻撃", "element": "water",
      "baseStats": { "maxHp": 80, "atk": 14, "def": 7, "spd": 9, "critRate": 5 },
      "uniqueAbility": { "name": "魔力循環", "description": "SP回復+1/ターン" },
      "unlocked": false, "unlockCondition": { "type": "soul_shards", "cost": 300 } },
    { "code": "rogue_gald", "name": "ガルド", "type": "盗賊・速攻クリ", "element": "wind",
      "baseStats": { "maxHp": 85, "atk": 11, "def": 8, "spd": 14, "critRate": 15 },
      "uniqueAbility": { "name": "先手必勝", "description": "戦闘1ターン目のダメージ+30%" },
      "unlocked": false, "unlockCondition": { "type": "achievement", "code": "total_runs_10" } }
  ]
}
```
処理概要: 1. セッション検証 → 2. charactersマスタ全件+player_charactersの解放状態を結合 → 3. 返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-202 キャラクター詳細取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/characters/{characterId}` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-105 |
| 関連テーブル | characters, player_characters, skills |
| Tx境界 | 読み取りのみ |

パスパラメータ: `characterId` = charactersマスタの `code`（例: `mage_lilia`。CORE_SPEC §3のマスタcode体系。仮決定 DEC-029: パス変数名はCORE_SPECどおり`characterId`とし、値はcodeを用いる）。
バリデーション: `z.string().regex(/^[a-z0-9_]{1,50}$/)`
レスポンス（200）: API-201の1件分 + `growth`（成長率係数）+ `initialSkills`（初期スキル一覧）。
処理概要: 1. セッション検証 → 2. code検索（無ければ `ERR_NOT_FOUND`）→ 3. 解放状態を付与し返却。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_INTERNAL

#### API-203 キャラクター解放

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/characters/{characterId}/unlock` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | 状態遷移で担保（解放済みなら `ERR_REWARD_ALREADY_CLAIMED`）。Idempotency-Key不要（ラン系ではない） |
| 関連画面 | SCR-104, SCR-105 |
| 関連テーブル | characters, player_characters, player_currencies, currency_transactions |
| Tx境界 | 通貨減算（条件付きUPDATE）+player_characters作成+currency_transactions記録を1トランザクション |

リクエスト: ボディなし（`{}`）。
レスポンス（200）:
```jsonc
{ "characterCode": "mage_lilia", "unlocked": true, "currencies": { "soulShards": 950 } }
```
処理概要:
1. セッション検証・code存在確認。
2. 解放済みチェック（済みなら `ERR_REWARD_ALREADY_CLAIMED`）。
3. 解放条件確認: `unlock_condition.type="soul_shards"` 以外（実績解放のrogue_gald等）は購入不可 → `ERR_INVALID_ACTION`（実績解放は実績解除処理が自動付与する）。
4. Tx内: `UPDATE player_currencies SET soul_shards = soul_shards - :cost WHERE user_id=? AND soul_shards >= :cost`（0行なら `ERR_INSUFFICIENT_SHARDS`）→ player_characters作成 → currency_transactions記録（reason="character_unlock"）。
5. 図鑑（player_codex, entry_type="character"）を登録。

エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_REWARD_ALREADY_CLAIMED / ERR_INVALID_ACTION / ERR_INSUFFICIENT_SHARDS / ERR_INTERNAL

#### API-204 永続強化実行

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/player/upgrades` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | 段数遷移+通貨条件付きUPDATEで実質担保（同一段の二重購入は `ERR_REWARD_ALREADY_CLAIMED`） |
| 関連画面 | SCR-106 |
| 関連テーブル | upgrade_nodes, player_upgrades, player_currencies, currency_transactions |
| Tx境界 | 通貨減算+player_upgrades段数更新+取引記録を1トランザクション |

リクエスト:
```jsonc
{ "upgradeNodeCode": "start_hp_up", "targetRank": 2 }
```
```ts
const upgradeSchema = z.object({
  upgradeNodeCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
  targetRank: z.number().int().min(1).max(5), // 期待する購入後の段数（二重購入検知用）
}).strict();
```
レスポンス（200）:
```jsonc
{ "upgradeNodeCode": "start_hp_up", "rank": 2, "maxRank": 3, "currencies": { "soulShards": 800 } }
```
処理概要:
1. Zod検証・セッション検証。upgrade_nodesマスタ存在確認。
2. 現在段数取得。`targetRank != 現在段数+1` なら `ERR_REWARD_ALREADY_CLAIMED`（既購入の再送）または `ERR_INVALID_ACTION`（飛ばし購入）。最大段数超過は `ERR_INVALID_ACTION`。前提ノード未達成も `ERR_INVALID_ACTION`。
3. Tx内: 通貨条件付き減算（不足は `ERR_INSUFFICIENT_SHARDS`）→ player_upgrades upsert（rank=targetRank）→ currency_transactions記録（reason="upgrade"）。
4. 更新後の強化一覧サマリを返す。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_INVALID_ACTION / ERR_REWARD_ALREADY_CLAIMED / ERR_INSUFFICIENT_SHARDS / ERR_INTERNAL

### 4.4 ダンジョン・ラン系

#### API-301 ダンジョン一覧取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/dungeons` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-201 |
| 関連テーブル | dungeons, dungeon_difficulties, player_progress |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{
  "items": [
    { "code": "forgotten_ruins", "name": "忘却の遺跡", "floors": 10,
      "difficulties": [ { "code": "normal", "name": "Normal", "unlocked": true } ],
      "bestRecord": { "cleared": true, "bestFloor": 10, "clearCount": 3 } }
  ]
}
```
処理概要: 1. セッション検証 → 2. dungeons+dungeon_difficultiesマスタ取得 → 3. player_progressの記録を結合 → 4. 返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-302 ダンジョン詳細取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/dungeons/{dungeonId}` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-202, SCR-207 |
| 関連テーブル | dungeons, dungeon_difficulties, dungeon_node_types, enemies |
| Tx境界 | 読み取りのみ |

パスパラメータ: `dungeonId` = dungeonsマスタの `code`（DEC-029と同方式）。
レスポンス（200）: 名称・説明・階層数・出現ノードタイプ一覧（BATTLE/STRONG/ELITE/BOSS/TREASURE/SHOP/REST/EVENT/BLESS/HEAL/CURSE/STORY/SECRET）・出現敵の図鑑登録済みシルエット情報・難易度（Normalのみ）。
処理概要: 1. セッション検証 → 2. code検索（無ければ `ERR_NOT_FOUND`）→ 3. 返却。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_INTERNAL

#### API-303 ダンジョン開始（重要）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs` |
| 認証 | 要 |
| 権限 | ゲスト:○ / 一般:○ / 管理者:○ |
| 冪等性 | **必須**。`Idempotency-Key` + `dungeon_runs.created_idempotency_key`（§2.10。同一キー再送は既存ランを201で再返却） |
| レート制限 | general 60回/分/ユーザー |
| 関連画面 | SCR-204, SCR-205, SCR-207 → 成功後 SCR-301 |
| 関連テーブル | dungeon_runs, dungeon_run_snapshots, dungeons, dungeon_difficulties, characters, player_characters, equipment, player_equipment, player_upgrades, upgrade_nodes |
| Tx境界 | dungeon_runs作成+初回スナップショット作成を1トランザクション（読み取り検証はTx前に実施し、Tx内でアクティブラン重複を部分ユニーク制約で最終防衛） |

リクエスト:
```jsonc
{
  "dungeonCode": "forgotten_ruins",
  "difficultyCode": "normal",
  "characterCode": "swordsman_rain",
  "equipment": { "weapon": "iron_sword", "armor": null, "accessory": null } // player_equipmentで永続解放済みのcodeのみ
}
```
バリデーション（Zod）:
```ts
const codeStr = z.string().regex(/^[a-z0-9_]{1,50}$/);
const startRunSchema = z.object({
  dungeonCode: codeStr,
  difficultyCode: codeStr,          // MVPは "normal" のみマスタに存在
  characterCode: codeStr,
  equipment: z.object({
    weapon: codeStr.nullable(),
    armor: codeStr.nullable(),
    accessory: codeStr.nullable(),
  }).strict(),
}).strict();
// ステータス値・seed・マップ等をクライアントから受け取るフィールドは存在しない（DEC-007）
```
レスポンス（201）:
```jsonc
{
  "result": { "created": true },
  "run": {
    "runId": "run_01J8Z...",
    "version": 1,
    "state": {
      "schemaVersion": 1,
      "dungeonCode": "forgotten_ruins",
      "difficultyCode": "normal",
      "map": {
        "floors": [
          { "floor": 1, "nodes": [ { "nodeId": "f1n1", "type": "BATTLE" } ] },
          { "floor": 2, "nodes": [ { "nodeId": "f2n1", "type": "BATTLE" }, { "nodeId": "f2n2", "type": "TREASURE" }, { "nodeId": "f2n3", "type": "EVENT" } ] }
          // …階層10まで。SECRETノードはEVENTとして表示（DEC-027の投影で正体を隠す）
        ],
        "edges": [ { "from": "f1n1", "to": ["f2n1", "f2n2", "f2n3"] } ]
      },
      "position": { "floor": 1, "nodeId": "f1n1", "phase": "battle" },
      "character": {
        "code": "swordsman_rain", "level": 1, "exp": 0,
        "stats": { "maxHp": 110, "atk": 13, "def": 10, "spd": 10, "critRate": 5, "critDmg": 150, "eva": 0, "acc": 0, "statusRes": 0 },
        "hp": 110, "sp": 10, "maxSp": 10
      },
      "skills": [ { "code": "skill_flame_slash", "level": 1 } ],
      "equipment": { "weapon": "iron_sword", "armor": null, "accessory": null },
      "relics": [], "items": [ { "code": "potion", "count": 1 } ],
      "gold": 100,
      "battle": { /* 階層1は開始戦闘のため生成済みの戦闘状態。形式はAPI-401参照 */ },
      "pendingReward": null,
      "earned": { "soulShards": 0, "rankExp": 0, "kills": 0 }
    }
  }
}
```
処理概要:
1. Zod検証（層1）、セッション検証（層2）。
2. **アクティブラン存在チェック**: `dungeon_runs` に `user_id=?, status='active'` があれば `ERR_RUN_ALREADY_ACTIVE`（details.runIdを返し、クライアントは再開導線へ）。ただし `created_idempotency_key` が送信キーと一致する場合は再送とみなし既存ランを201で再返却。
3. マスタ検証: dungeonCode/difficultyCodeがdungeons/dungeon_difficultiesに存在し公開中か（無ければ `ERR_NOT_FOUND`）。
4. **キャラ所持検証**: player_charactersに解放済みレコードがあるか（無ければ `ERR_INVALID_ACTION`, details.reason="character_locked"）。
5. **装備所持検証**: equipmentの各スロットについて、player_equipment（永続解放装備）に所持があり、slotが一致するか（`ERR_INVALID_ACTION`, reason="equipment_not_owned" / "slot_mismatch"）。
6. **永続強化の適用**: player_upgrades×upgrade_nodesから初期HP+5%系・初期ATK+3%系・初期ゴールド+50系・開始時レリック・リロール+1を集計し、`applyPermanentUpgrades`（domain/progression）で初期ステータス・初期ゴールド・初期レリック・リロール回数を算出（総和はステータス+30%以内、CORE_SPEC §5.9）。
7. **seed生成**: `generateDungeonSeed`（domain/dungeon）でCSPRNGから32bit seedを生成。
8. **マップ生成**: `generateDungeonMap(seed, generationConfig)`（domain/dungeon）で階層1〜10のノードマップを生成。生成制御（CORE_SPEC §5.6）: 階層1=開始戦闘1個・階層10=BOSS1個・各階層2〜4ノード・階層5/9にREST必須・SHOP全体1〜2・ELITEは階層3以降・同一タイプ3連続禁止・SECRET10%・全パスがボス到達可能であることを`validateMapReachability`で検証。
9. **run_state組み立て**: `startDungeonRun`（domain/dungeon）で初期run_state（§8のJSONB骨子）を構築。階層1は開始戦闘のため `startBattle`（domain/battle）で敵編成を生成し `battle` を格納、phase="battle"。rngCursorはマップ生成・敵編成で消費した回数。
10. Tx内: dungeon_runs作成（status='active', seed, version=1, run_state, created_idempotency_key。部分ユニークインデックス `(user_id) WHERE status='active'` で二重作成を最終防衛）+ dungeon_run_snapshots初回世代を作成。
11. RunView投影（DEC-027）に変換し201で返却。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_ALREADY_ACTIVE / ERR_INVALID_ACTION / ERR_DUPLICATE_REQUEST / ERR_RATE_LIMITED / ERR_MAINTENANCE / ERR_INTERNAL

#### API-304 現在ラン取得（再開兼用）

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/runs/current` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-101（再開ボタン）, SCR-301, SCR-313（復帰）, ERR_CONFLICT_VERSION後の再同期 |
| 関連テーブル | dungeon_runs |
| Tx境界 | 読み取りのみ |

レスポンス（200）: `{ "run": { "runId", "version", "state": RunView } }`（API-303と同形）。
status='cleared'/'failed'/'retired'（未finalize）のランも返し、`state.position.phase` 相当としてトップレベルに `status` を含める。クライアントはstatusに応じてSCR-301/302/401/402へ復帰する。
処理概要: 1. セッション検証 → 2. `status IN ('active','cleared','failed','retired')` の最新ランを取得（無ければ `ERR_NOT_FOUND`）→ 3. RunView投影で返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_INTERNAL

#### API-305 次ノード選択（重要）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/select-node` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | **必須**（Idempotency-Key + run_state.lastRequest） |
| レート制限 | general 60回/分/ユーザー |
| 関連画面 | SCR-301 → ノードタイプに応じ SCR-302/305/306/307/308 |
| 関連テーブル | dungeon_runs, dungeon_run_snapshots, enemies, enemy_actions, enemy_ai_rules, reward_tables, equipment, skills, relics, random_events, random_event_choices, stories |
| Tx境界 | run_state更新（+階層移動時のスナップショット世代追加・3世代超の削除）を1トランザクション |

リクエスト:
```jsonc
{ "version": 7, "nodeId": "f4n2" }
```
バリデーション（Zod）:
```ts
const selectNodeSchema = z.object({
  version: z.number().int().min(1),
  nodeId: z.string().regex(/^f(10|[1-9])n[1-4]$/),
}).strict();
```
レスポンス（200・例1: 戦闘ノード）:
```jsonc
{
  "result": {
    "nodeType": "BATTLE",
    "battle": {
      "enemies": [
        { "slot": 0, "code": "goblin", "name": "ゴブリン", "element": "none", "hp": 58, "maxHp": 58, "intent": { "type": "attack", "label": "攻撃" } },
        { "slot": 1, "code": "fire_imp", "name": "火の小鬼", "element": "fire", "hp": 44, "maxHp": 44, "intent": { "type": "skill", "label": "火傷付与" } }
      ],
      "turnNo": 1, "canFlee": true
    }
  },
  "run": { "runId": "run_01J8Z...", "version": 8, "state": { /* phase="battle", battle格納済みのRunView */ } }
}
```
レスポンス（200・例2: 宝箱ノード）:
```jsonc
{
  "result": {
    "nodeType": "TREASURE",
    "pendingReward": {
      "type": "treasure",
      "choices": [
        { "index": 0, "kind": "equipment", "code": "flame_blade", "rarity": "rare", "slot": "weapon" },
        { "index": 1, "kind": "gold", "amount": 120 }
      ],
      "claimed": false
    }
  },
  "run": { "runId": "run_01J8Z...", "version": 8, "state": { /* phase="reward_pending" */ } }
}
```
※nodeTypeにより `result` が変わる: SHOP→`shop.items[]`（在庫と価格、`generateShopItems`で抽選済み）/ REST→`rest.options`（"heal" | "upgrade_skill"）/ EVENT・BLESS・HEAL・CURSE→`event`（本文とchoices。SECRETはEVENT扱い上位報酬でnodeTypeは"EVENT"として返す）/ STORY→`story`（本文。読了で完了）/ STRONG・ELITE・BOSS→BATTLEと同形（`canFlee: false`はELITE/BOSS。CORE_SPEC §5.4の逃走不可）。

処理概要:
1. Zod検証・セッション検証・アクティブラン取得（無ければ `ERR_NOT_FOUND`）。
2. 冪等キー照合（§2.10。再送なら保存レスポンス返却）。
3. run_state整合性検証（`validateRunState` + `selectNextNode` 前段, domain/dungeon）:
   - `position.phase == "map_select"` であること（戦闘中・報酬未受領中は `ERR_RUN_STATE_INVALID`）。
   - **隣接ノード検証**: `map.edges` 上で現在ノードから `nodeId` への辺が存在すること。存在しないノードIDや飛び越え・後戻りは `ERR_INVALID_ACTION`（details.reason="not_adjacent"）。
4. `selectNextNode(runState, nodeId)`（domain/dungeon）でpositionを更新し、**ノードタイプ別の状態生成をサーバーで実施**（PRNGはseed+rngCursorから継続）:
   - BATTLE/STRONG/ELITE/BOSS: `startBattle`（domain/battle）。階層と敵種別から敵編成（1〜3体）を抽選し、`stat(floor) = base × (1 + 0.12 × (floor - 1)) × difficultyMod` と種別補正（強敵 HP×1.5,ATK×1.15 / エリート HP×2.0,ATK×1.3 / ボス HP×4.0,ATK×1.5）でステータスを確定。初回intentを `selectEnemyAction`（domain/enemy）で決定。phase="battle"。
   - TREASURE: `generateTreasureReward`（domain/reward）でreward_tablesから抽選し `pendingReward` を設定。phase="reward_pending"。**抽選はこの時点でサーバーが確定**し、API-503は受領確定のみ行う。
   - SHOP: `generateShopItems`（domain/reward）で商品リストを生成しrun_state.shopに格納。phase="node_action"。
   - REST: 休憩選択肢を提示。phase="node_action"。
   - EVENT/BLESS/HEAL/CURSE/SECRET: random_eventsから抽選（SECRETは上位報酬テーブル）し、選択肢を提示。phase="node_action"。
   - STORY: storiesの該当話を提示し、player_story_progressへは finalize時ではなく即時記録しない（ラン内はrun_stateのみ。仮決定 DEC-030: ストーリー既読の永続反映もAPI-307に集約）。
5. rngCursor更新を含む新run_stateで楽観ロックUPDATE（`WHERE version=:sent`。0行なら `ERR_CONFLICT_VERSION`）。階層が進んだ場合は同Txで `dungeon_run_snapshots` に世代追加し、直近3世代を超える分を削除（`saveRunProgress`）。
6. `result` + RunView投影を返却。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_RATE_LIMITED / ERR_INTERNAL

#### API-306 リタイア

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/retire` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | **必須**（Idempotency-Key）+ status遷移（active→retiredの一方向）で二重実行防止 |
| 関連画面 | SCR-314 → SCR-403 |
| 関連テーブル | dungeon_runs |
| Tx境界 | status更新+run_state確定を1トランザクション（報酬付与はここでは行わない） |

リクエスト:
```jsonc
{ "version": 15 }
```
バリデーション: `z.object({ version: z.number().int().min(1) }).strict()`
レスポンス（200）:
```jsonc
{
  "result": {
    "status": "retired",
    "resultPreview": {
      "reachedFloor": 6, "kills": 14,
      "earnedSoulShards": 35, "payoutRate": 0.8, "payoutSoulShards": 28,
      "earnedRankExp": 120
    }
  },
  "run": { "runId": "run_01J8Z...", "version": 16, "state": { /* status=retired のRunView */ } }
}
```
処理概要:
1. Zod検証・セッション検証・アクティブラン取得・冪等キー照合。
2. phase検証: 戦闘中（phase="battle"）のリタイアは不可 → `ERR_RUN_STATE_INVALID`（戦闘からは逃走=API-402で離脱後にリタイア）。
3. `retireDungeon(runState)`（domain/dungeon）で `earned` を確定し、持ち帰り率80%（CORE_SPEC §5.6）でプレビューを計算。
4. 楽観ロックUPDATEで `status='retired'`。**通貨・EXPの付与はまだ行わない**（API-307 finalizeで付与）。
5. リザルトプレビューを返却。クライアントはSCR-403表示後にAPI-307を呼ぶ。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_RATE_LIMITED / ERR_INTERNAL

#### API-307 リザルト確定（クリア/敗北後の受領・重要）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/finalize` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | **必須**。Idempotency-Key + **status遷移（cleared/failed/retired → finalized の一方向）** の二重防御。finalized済みへの再実行は `ERR_REWARD_ALREADY_CLAIMED`、同一キー再送は保存レスポンス再返却 |
| レート制限 | general 60回/分/ユーザー |
| 関連画面 | SCR-403, SCR-404, SCR-405, SCR-406, SCR-407 → SCR-101 |
| 関連テーブル | dungeon_runs, player_progress, player_currencies, currency_transactions, player_codex, player_achievements, player_characters, characters, achievements, battle_logs |
| Tx境界 | **付与処理全体を1トランザクション**（下記手順4の全て+status更新。どれか失敗なら全ロールバック） |

リクエスト:
```jsonc
{ "version": 22 }
```
バリデーション: `z.object({ version: z.number().int().min(1) }).strict()`
レスポンス（200）:
```jsonc
{
  "result": {
    "finalStatus": "cleared",                    // 確定元: cleared / failed / retired
    "rewards": {
      "soulShards": { "earned": 180, "payoutRate": 1.0, "clearBonus": 100, "granted": 280, "balance": 1530 },
      "rankExp": { "earned": 450, "rankBefore": 8, "rankAfter": 9, "rankUp": true },
      "codexNewEntries": [ { "entryType": "enemy", "code": "ruin_guardian" }, { "entryType": "relic", "code": "lucky_coin" } ],
      "achievementsUnlocked": [ { "code": "first_clear", "name": "遺跡踏破" } ],
      "charactersUnlocked": [ { "code": "rogue_gald", "name": "ガルド" } ]  // 実績連動解放（例: total_runs_10）
    }
  },
  "run": { "runId": "run_01J8Z...", "version": 23, "state": { /* status=finalized のRunView */ } }
}
```
処理概要:
1. Zod検証・セッション検証。`status IN ('cleared','failed','retired')` のランを取得（activeなら `ERR_RUN_STATE_INVALID`、存在しない/finalized済みで冪等キー不一致なら `ERR_REWARD_ALREADY_CLAIMED`、ラン自体が無ければ `ERR_NOT_FOUND`）。
2. 冪等キー照合（再送は保存済みレスポンスを返却）。
3. `grantPersistentRewards(runState, status)`（domain/progression）で付与内容を純関数計算:
   - ソウルシャード: `earned.soulShards` × 持ち帰り率（クリア100%+クリアボーナス / リタイア80% / 敗北50%、CORE_SPEC §5.6）。
   - ランクEXP: `earned.rankExp` を加算し、`expToRank(R) = 100 × R^1.8` でランクアップ判定（上限50）。
   - 図鑑: ラン中に遭遇した敵・取得したスキル/レリック/装備をplayer_codex（entry_type別）へ新規登録分だけ抽出。
   - 実績: 累計統計（総ラン数・クリア数・撃破数等）更新後の解除判定（`evaluateAchievements`）。実績連動のキャラ解放（rogue_gald=累計ラン10回）もここで判定。
   - ストーリー既読反映（DEC-030）。
4. **1トランザクションで一括付与**:
   1. `UPDATE dungeon_runs SET status='finalized', version=version+1, run_state=... WHERE id=? AND version=:sent AND status IN ('cleared','failed','retired')` — **0行なら即ロールバックし `ERR_CONFLICT_VERSION`（version不一致）または `ERR_REWARD_ALREADY_CLAIMED`（status不一致=先行finalize）を判別して返す。この条件付きUPDATEが二重付与防止の最終防衛線**。
   2. player_currencies加算 + currency_transactions記録（reason="run_finalize", run_id付き）。
   3. player_progress更新（rank/rank_exp/統計）。
   4. player_codex一括INSERT（ON CONFLICT DO NOTHING）。
   5. player_achievements INSERT + 連動player_characters INSERT。
   6. run_state.lastRequestにレスポンス写しを保存（冪等再送用）。
5. battle_logsはランの戦闘終了時に随時書き込み済み（API-402）。finalizeでは触らない（保持30日、検算用に残す）。
6. リザルト（SCR-403〜407で演出に使う全データ）を返却。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_REWARD_ALREADY_CLAIMED / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_RATE_LIMITED / ERR_INTERNAL

### 4.5 戦闘系

#### API-401 戦闘状態取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/runs/current/battle` |
| 認証 | 要 / 権限: 全区分○ / 冪等性: GET |
| 関連画面 | SCR-302 |
| 関連テーブル | dungeon_runs |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{
  "version": 12,
  "battle": {
    "nodeId": "f3n1", "turnNo": 4, "phase": "player_input",
    "player": { "hp": 74, "maxHp": 118, "sp": 6, "maxSp": 10,
                "statuses": [{ "code": "poison", "remainingTurns": 2 }],
                "buffs": [{ "code": "atkUp", "value": 15, "remainingTurns": 1 }],
                "skills": [{ "code": "flame_slash", "level": 2, "spCost": 3, "usable": true }],
                "items": [{ "code": "potion", "count": 2 }] },
    "enemies": [
      { "id": "e1", "code": "goblin", "name": "ゴブリン", "hp": 30, "maxHp": 52,
        "element": "none", "statuses": [], "buffs": [],
        "intent": { "label": "強攻撃", "icon": "attack_heavy", "estimated": 18 } }
    ],
    "order": ["player", "e1"],
    "canFlee": true
  }
}
```
処理概要: 1. セッション検証 → 2. アクティブラン取得（無ければ `ERR_NOT_FOUND`）→ 3. `phase != 'battle'` は `ERR_RUN_STATE_INVALID` → 4. 表示用View（seed・rngCursor・敵の内部行動テーブルは**含めない**）を返却。リロード復帰（SCR-302再構築）にも本APIを使用する。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INTERNAL

#### API-402 行動実行（最重要）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/battle/actions` |
| 認証 | 要 / 権限: 全区分○ |
| 冪等性 | **必須**: `Idempotency-Key` + version楽観ロック（§3参照） |
| 関連画面 | SCR-302, SCR-303（戦闘終了時のレベルアップ連鎖）, SCR-402（敗北） |
| 関連テーブル | dungeon_runs, battle_logs（戦闘終了時）, dungeon_run_snapshots |
| Tx境界 | 検証→ターン解決→run_state保存（+終了時battle_logs INSERT）を1トランザクション |
| レート制限 | 60回/分/ユーザー |

リクエスト:
```jsonc
{ "version": 12,
  "action": { "type": "skill", "skillCode": "flame_slash", "targetId": "e1" } }
```
```ts
const actionSchema = z.object({
  version: z.number().int().min(0),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('attack'), targetId: z.string().regex(/^e[1-3]$/) }),
    z.object({ type: z.literal('skill'), skillCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
               targetId: z.string().regex(/^(e[1-3]|player)$/).optional() }),
    z.object({ type: z.literal('guard') }),
    z.object({ type: z.literal('item'), itemCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
               targetId: z.string().optional() }),
    z.object({ type: z.literal('flee') }),
  ]),
}).strict();
```
レスポンス（200、戦闘継続時）:
```jsonc
{
  "version": 13,
  "logs": [
    { "turnNo": 4, "actorId": "player", "action": "skill", "detailCode": "flame_slash",
      "targetId": "e1", "damage": 34, "isCrit": true, "isMiss": false,
      "hpAfter": { "player": 74, "e1": 0 } },
    { "turnNo": 4, "actorId": "e1", "action": "enemy_action", "note": "dead_skip", "hpAfter": {} }
  ],
  "battle": { /* API-401と同形の最新状態 */ },
  "battleEnded": false
}
```
レスポンス（200、勝利時の追加フィールド）:
```jsonc
{
  "battleEnded": true, "result": "win",
  "reward": { "gold": 45, "exp": 60, "drops": [{ "type": "equipment", "code": "iron_sword", "rarity": "common" }] },
  "levelUp": { "levels": 1, "pendingSkillChoices": true },  // → API-501/502へ
  "runStatus": "active"   // ボス撃破時は "cleared" → SCR-401 → API-307へ
}
```
処理概要:
1. Zod検証・セッション検証・冪等キー確認（保存済みなら**再実行せず**保存応答を返す）。
2. アクティブラン取得。`phase != 'battle'` → `ERR_RUN_STATE_INVALID`。version不一致 → `ERR_CONFLICT_VERSION`。
3. **行動正当性のサーバー検証**（DEC-007。クライアント値は「選択」のみ）: スキル所持・SP残量・対象生存・アイテム所持数・逃走可否（ボス/エリート不可）。違反 → `ERR_INVALID_ACTION`。
4. domainでターン解決: `executePlayerAction` → 生存敵ごとに `executeEnemyAction` → 状態異常tick（poison/burn/regen）→ バフ/状態異常の残ターン減算 → `checkBattleEnd`。**ダメージ・命中・クリティカル・状態異常の成否は全てサーバーのRng（seed+rngCursor）で決定**。
5. 勝利時: `calculateBattleReward` → `gainExperience`（レベルアップ分のスキル3択キューをpendingRewardへ）→ ノードcleared → ボスなら `completeDungeon`（status='cleared'）。敗北時: `failDungeon`（status='failed'）。逃走成功時: phase='map_select'（ノード未クリア）。
6. `saveRunProgress`（楽観ロックUPDATE+冪等応答保存）。戦闘終了時はbattle_logsへターンログ一括INSERT。
7. logs（クライアントはこれを演出として再生するだけ）と最新状態を返す。

エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_RATE_LIMITED / ERR_INTERNAL

### 4.6 報酬・ノードアクション系

#### API-501 レベルアップ候補取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/runs/current/level-up` |
| 認証 | 要 / 冪等性: GET（**保存済み候補を返すのみ。再抽選しない**） |
| 関連画面 | SCR-303, SCR-304 |
| 関連テーブル | dungeon_runs, skills |
| Tx境界 | 読み取りのみ |

レスポンス（200）:
```jsonc
{ "version": 13,
  "pending": { "remaining": 2, "rerollRemaining": 1,
    "choices": [
      { "index": 0, "skillCode": "flame_slash", "isUpgrade": true,  "currentLevel": 2, "rarity": "rare" },
      { "index": 1, "skillCode": "poison_edge", "isUpgrade": false, "rarity": "common" },
      { "index": 2, "skillCode": "guard_stance", "isUpgrade": false, "rarity": "common" } ] } }
```
処理概要: 1. セッション検証 → 2. `pendingReward.type='levelup_queue'` 検証（違えば `ERR_RUN_STATE_INVALID`）→ 3. 保存済み候補を返却。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INTERNAL

#### API-502 スキル選択（3択/リロール/スキップ）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/level-up/select` |
| 認証 | 要 / 冪等性: 必須（Idempotency-Key + version） |
| 関連画面 | SCR-303 |
| 関連テーブル | dungeon_runs |
| Tx境界 | 選択適用+保存を1トランザクション |

リクエスト:
```jsonc
{ "version": 13, "action": "pick", "choiceIndex": 1 }   // "reroll" / "skip" も可
```
```ts
const selectSchema = z.object({
  version: z.number().int().min(0),
  action: z.enum(['pick', 'reroll', 'skip']),
  choiceIndex: z.number().int().min(0).max(2).optional(), // pick時必須
}).strict().refine(v => v.action !== 'pick' || v.choiceIndex !== undefined);
```
処理概要: 1. 冪等キー・version・`pendingReward` 検証 → 2. `selectSkill`（**choices配列のindexのみ受理**。スキルコード直接指定は受け取らない=候補外選択を構造的に排除）→ 3. キュー残があれば次の3択を生成、なければphase復帰 → 4. 保存・返却。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_REWARD_ALREADY_CLAIMED / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-503 宝箱開封

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/treasure/open` |
| 認証 | 要 / 冪等性: 必須 |
| 関連画面 | SCR-305, SCR-309（装備ドロップ時）, SCR-310（レリック時） |
| 関連テーブル | dungeon_runs |
| Tx境界 | 開封適用+保存を1トランザクション |

リクエスト: `{ "version": 14 }`
処理概要: 1. `pendingReward.type='treasure' && !claimed` 検証 → 2. **入場時に抽選保存済みの内容**を適用（開封時に再抽選しない=リロード連打で内容が変わらない）→ 3. claimed=true、装備/レリックは受領確認（API-507/508）へ、ゴールド・消耗品は即時適用 → 4. phase遷移・保存。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_REWARD_ALREADY_CLAIMED / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-504 ショップ購入

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/shop/purchase` |
| 認証 | 要 / 冪等性: 必須（冪等キー+slotのsoldOutフラグ二重防御） |
| 関連画面 | SCR-306 |
| 関連テーブル | dungeon_runs |
| Tx境界 | gold減算+付与+soldOut更新+保存を1トランザクション |

リクエスト: `{ "version": 15, "slotIndex": 2 }`（`z.number().int().min(0).max(4)`。売却は `{ "sell": { "equipmentCode": "..." } }`）
処理概要: 1. 現在ノード=SHOP検証 → 2. `purchaseShopItem`（soldOut→`ERR_REWARD_ALREADY_CLAIMED`、gold不足→`ERR_INSUFFICIENT_GOLD`。**価格はサーバー保存値。クライアントから金額を受け取らない**）→ 3. 保存・返却（更新後gold・品揃え）。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INSUFFICIENT_GOLD / ERR_REWARD_ALREADY_CLAIMED / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-505 休憩実行

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/rest` |
| 認証 | 要 / 冪等性: 必須（ノードcleared化で二重実行を拒否） |
| 関連画面 | SCR-307 |
| 関連テーブル | dungeon_runs |
| Tx境界 | 適用+保存を1トランザクション |

リクエスト: `{ "version": 16, "choice": "heal" }`（`z.enum(['heal','upgrade_skill'])`。upgrade_skill時は `skillCode` 必須=所持スキル検証）
処理概要: 1. 現在ノード=REST・未使用検証 → 2. heal: HP50%回復（maxHp超過なし）/ upgrade_skill: 所持スキルLv+1（Lv3上限→`ERR_INVALID_ACTION`）→ 3. ノードcleared、phase='map_select'、保存。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-506 イベント選択

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/event/choose` |
| 認証 | 要 / 冪等性: 必須 |
| 関連画面 | SCR-308 |
| 関連テーブル | dungeon_runs, random_events, random_event_choices |
| Tx境界 | 結果抽選+適用+保存を1トランザクション |

リクエスト: `{ "version": 17, "choiceIndex": 0 }`（`z.number().int().min(0).max(2)`）
処理概要: 1. 現在ノードがイベント系（EVENT/BLESS/HEAL/CURSE/STORY/SECRET）で未処理か検証 → 2. `executeRandomEvent`（**結果の確率抽選はサーバーRng**）→ 3. outcome（結果テキスト・増減値）と最新状態を返却。付与系（レリック等）はpendingReward経由でAPI-507/508へ。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-507 装備変更（ラン内）

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/equipment` |
| 認証 | 要 / 冪等性: 必須 |
| 関連画面 | SCR-309, SCR-312 |
| 関連テーブル | dungeon_runs, equipment |
| Tx境界 | 装備適用+ステータス再計算+保存を1トランザクション |

リクエスト: `{ "version": 18, "action": "equip", "equipmentCode": "iron_sword" }`（`action: z.enum(['equip','discard'])`。equipはラン内所持品のみ=未所持→`ERR_INVALID_ACTION`）
処理概要: 1. 所持検証 → 2. スロット（weapon/armor/accessory）へ装着、旧装備は所持品へ → 3. ステータス再計算（基礎値+装備加算、得意武器+10%）→ 4. 保存。戦闘中（phase='battle'）は変更不可（`ERR_RUN_STATE_INVALID`）。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_INVALID_ACTION / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

#### API-508 レリック取得確定

| 項目 | 内容 |
|---|---|
| メソッド/パス | POST `/api/v1/runs/current/relic` |
| 認証 | 要 / 冪等性: 必須 |
| 関連画面 | SCR-310 |
| 関連テーブル | dungeon_runs, relics |
| Tx境界 | 取得適用+保存を1トランザクション |

リクエスト: `{ "version": 19, "accept": true }`（呪い付きレリックは辞退可。accept: z.boolean()）
処理概要: 1. `pendingReward.type='relic' && !claimed` 検証 → 2. accept=true: relics追加（**同一レリック重複不可**=既所持なら代替ゴールド付与50G、仮決定）/ false: 辞退（代替なし）→ 3. claimed=true、phase復帰、保存。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_NOT_FOUND / ERR_RUN_STATE_INVALID / ERR_REWARD_ALREADY_CLAIMED / ERR_CONFLICT_VERSION / ERR_DUPLICATE_REQUEST / ERR_INTERNAL

### 4.7 図鑑・設定系

#### API-601 図鑑取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/codex?type=skill|relic|enemy|equipment|character` |
| 認証 | 要 / 冪等性: GET |
| 関連画面 | SCR-108, SCR-109, SCR-110 |
| 関連テーブル | player_codex, skills, relics, enemies, equipment, characters |
| Tx境界 | 読み取りのみ |

レスポンス（200）: マスタ全件（発見済み=詳細、未発見=シルエット+「???」）と発見率。`type` 未指定は全種サマリ。
処理概要: 1. セッション検証 → 2. マスタとplayer_codexをLEFT JOIN相当で結合（**未発見エントリの詳細データ（数値・効果）は返さない**）→ 3. 返却。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-602 設定取得 / API-603 設定更新

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET / PUT `/api/v1/settings` |
| 認証 | 要 / 冪等性: GETは常時、PUTは全項目上書きのため自然冪等 |
| 関連画面 | SCR-116 |
| 関連テーブル | user_settings |
| Tx境界 | 単一UPDATE |

PUTリクエスト:
```jsonc
{ "battleSpeed": 2, "damageDisplay": true, "screenShake": false, "colorAssist": true }
```
```ts
const settingsSchema = z.object({
  battleSpeed: z.union([z.literal(1), z.literal(2)]),
  damageDisplay: z.boolean(), screenShake: z.boolean(), colorAssist: z.boolean(),
}).strict();
```
処理概要: GET=user_settings取得（無ければデフォルト生成）。PUT=Zod検証→upsert。**ゲーム進行に影響する値は含めない**（演出設定のみ。チート面の検証対象外にできる）。
エラー: ERR_VALIDATION / ERR_AUTH_UNAUTHORIZED / ERR_INTERNAL

#### API-604 セーブデータ取得

| 項目 | 内容 |
|---|---|
| メソッド/パス | GET `/api/v1/save` |
| 認証 | 要 / 冪等性: GET |
| 関連画面 | SCR-001（起動時）, SCR-101 |
| 関連テーブル | dungeon_runs, player_progress, player_currencies |
| Tx境界 | 読み取りのみ |

処理概要: 起動時の一括状態取得。`{ hasActiveRun, runSummary(あれば階層・キャラ・phase), player(rank/currencies), maintenance }` を返す。実体はAPI-304+API-102の集約ビュー（**API-304と統合可、仮決定: MVPでは本APIを実装しAPI-304は内部共用**）。
エラー: ERR_AUTH_UNAUTHORIZED / ERR_MAINTENANCE / ERR_INTERNAL

---

## 5. 戦闘1ターンの往復実例（サーバー権威の具体像）

クライアントが送るのは「スキルで e1 を攻撃する」という**選択だけ**であり、数値は一切送らない。

```
→ POST /api/v1/runs/current/battle/actions
  Idempotency-Key: 018f3a2e-7c41-7b2a-9f10-1a2b3c4d5e6f
  { "version": 12, "action": { "type": "skill", "skillCode": "flame_slash", "targetId": "e1" } }

（サーバー内: 冪等キー確認 → version検証 → スキル所持/SP検証 → Rng復元(seed, rngCursor=41)
  → 命中判定(hit 95%) → クリ判定(5%) → ダメージ式 → 敵行動(intent実行) → poison tick
  → 終了判定 → rngCursor=47で保存 → version=13）

← 200
{
  "version": 13,
  "logs": [
    { "turnNo": 4, "actorId": "player", "action": "skill", "detailCode": "flame_slash",
      "targetId": "e1", "damage": 34, "isCrit": false, "isMiss": false,
      "hpAfter": { "player": 74, "e1": 18 } },
    { "turnNo": 4, "actorId": "e1", "action": "enemy_action", "detailCode": "goblin_attack",
      "targetId": "player", "damage": 12, "isCrit": false, "isMiss": false,
      "hpAfter": { "player": 62, "e1": 18 } },
    { "turnNo": 4, "actorId": "player", "action": "status_tick", "detailCode": "poison",
      "damage": 9, "hpAfter": { "player": 53, "e1": 18 } }
  ],
  "battle": { "turnNo": 5, "phase": "player_input", "enemies": [ { "id": "e1", "hp": 18,
    "intent": { "label": "攻撃", "icon": "attack", "estimated": 12 } } ], "order": ["player", "e1"] },
  "battleEnded": false
}
```

クライアントは `logs` を順に演出再生（倍速設定はここの再生速度のみ変更）し、`battle` で画面を最新化する。
通信断で応答を受け損ねた場合は**同一Idempotency-Key**で再送すれば、保存済みの同一応答が返り、ターンが二重に進むことはない。

---

## 未決事項

- API-604とAPI-304の統合可否（現仮決定: API-604を実装しAPI-304は内部共用）。実装時のクライアント都合で最終判断（ISSUE-014候補）。
- レート制限のストア: Vercelサーバーレスではインメモリ不可のため、MVPはDB（idempotency_keys同様の軽量テーブル）かUpstash Redis無料枠のどちらかを選定する（ISSUE-015候補。仮決定: DBベースの固定ウィンドウ方式）。
- API-508の既所持レリック代替（ゴールド50）は仮決定。抽選側で既所持を除外できれば不要になる。
- WebSocket/SSEは全面不採用（ターン制のため不要）。将来の非同期要素（フレンド等）導入時に再検討。

## 実装時の注意点

- 全ラン系変更APIは「冪等キー確認 → version検証 → 正当性検証 → domain解決 → saveRunProgress」の順序を**共通ミドルウェア/ヘルパで統一実装**し、API個別実装での順序ミスを防ぐこと。
- レスポンスに seed / rngCursor / 敵の内部行動テーブル / 未開封のpendingReward内容を**絶対に含めない**（情報チートの防止）。
- Zodスキーマは `.strict()` を必須とし、未知フィールドを拒否する。
- エラーレスポンスの `details` にスタックトレースや内部SQL・テーブル名を含めない（22_Security_Design.md）。
- OpenAPI定義（zod-to-openapi）を実装フェーズで生成し、本書の表と乖離しないようCIで検証することを推奨。

## 関連設計書

- [12_Database_Design.md](./12_Database_Design.md) — テーブル定義・楽観ロック・冪等キー
- [15_Save_Data_Design.md](./15_Save_Data_Design.md) — run_state構造・保存/再開
- [20_Detailed_Design.md](./20_Detailed_Design.md) — 各APIが呼ぶdomain関数の仕様
- [14_Authentication_Design.md](./14_Authentication_Design.md) — 認証・セッション
- [22_Security_Design.md](./22_Security_Design.md) — 不正対策の全体像
- [21_Test_Design.md](./21_Test_Design.md) — APIテストケース
