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
