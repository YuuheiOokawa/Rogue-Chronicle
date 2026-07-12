# 23. ログ・監視設計書（Logging & Monitoring Design）

## 1. 目的と位置づけ

本書は「Rogue Chronicle」のログ出力方針・ログ種別・禁止事項・traceId設計・監視項目・通知・ログ肥大化対策を定義する。MVPは個人開発かつVercel + Neon構成のため、**追加コストゼロ〜最小**で「本番障害の原因調査」「不正行為の追跡」「ゲームバランス分析の土台」を成立させることを目標とする（DEC-020: error_logsテーブルは作らずVercel標準ログ+構造化ログ、将来Sentry）。

### 関連文書
- CORE_SPEC（共通仕様）/ 10_System_Architecture.md / 12_Database_Design.md / 13_API_Design.md / 21_Test_Design.md / 22_Security_Design.md / 24_CI_CD_Design.md

---

## 2. ログ方針

### 2.1 基本方針
- **構造化JSONログ**: 全ログを1行JSONで `console.log/warn/error` に出力し、Vercel Logs（Runtime Logs）に集約する。人間可読テキストログは使用しない
- 出力は `src/server/services/logger.ts`（LoggingModule）の共通ロガー経由に限定。`console.*` の直接呼び出しはESLintルール（`no-console`）で禁止（ロガー内部のみ許可）
- DB保存が必要なログ（監査・戦闘・通貨）はテーブルに保存し、console構造化ログは調査・分析用の補助とする

### 2.2 共通フィールド（全ログ必須）

| フィールド | 型 | 内容 |
|---|---|---|
| timestamp | string | ISO 8601 UTC（例: `2026-07-12T03:15:00.123Z`） |
| level | string | debug / info / warn / error |
| message | string | イベント概要（英語スネーク推奨: `run_started`, `login_failed`） |
| traceId | string | リクエスト単位UUID（3章） |
| userId | string \| null | ユーザーUUIDのみ。**メールアドレス・表示名は不可**。未認証時null |
| apiId | string \| null | CORE_SPECのAPI ID（例: `API-303`）。API外（cron等）はnull |
| durationMs | number \| null | 処理時間（アクセスログ・遅延調査用） |
| details | object \| null | 種別ごとの追加情報（4.3のマスク方針適用） |

出力例:
```json
{"timestamp":"2026-07-12T03:15:00.123Z","level":"info","message":"run_started","traceId":"a1b2c3d4-...","userId":"9f8e7d6c-...","apiId":"API-303","durationMs":142,"details":{"runId":"...","dungeonCode":"forgotten_ruins","characterCode":"swordsman_rain","seed":123456789}}
```

### 2.3 ログレベル定義

| level | 用途 | 本番出力 | 例 |
|---|---|---|---|
| debug | 開発時の詳細トレース（計算途中値・PRNGカーソル等） | しない（`LOG_LEVEL=info`） | ダメージ計算内訳 |
| info | 正常系の業務イベント・アクセスログ | する | ログイン成功、ラン開始/終了、報酬付与 |
| warn | 異常だが自動継続可能。不正の疑い、リトライ発生、閾値接近 | する | ERR_INVALID_ACTION検知、ERR_CONFLICT_VERSION多発、レート制限発動 |
| error | 処理失敗・要調査。5xx応答、DB接続失敗、未捕捉例外 | する | ERR_INTERNAL、トランザクション失敗、外部依存障害 |

- 4xxのうちユーザー起因（バリデーション・認証失敗）はinfo、改ざん疑い（ERR_INVALID_ACTION等の不正系）はwarn、5xxはerrorに統一する

---

## 3. traceId設計

- Next.js ミドルウェア（または route handler 共通ラッパ）でリクエストごとにUUID v4を発行し、`AsyncLocalStorage` でリクエストスコープに保持。usecase・repository・domainイベントの全ログに自動付与する
- クライアントが `X-Trace-Id` を送ってきた場合も**採用せずサーバーで再発行**する（偽装によるログ汚染防止。クライアント値は `details.clientTraceId` に参考記録のみ、仮決定）
- 応答ヘッダ `X-Trace-Id` に必ず含める
- エラーレスポンス共通形式 `{ errorCode, message, details, traceId, timestamp }` の `traceId` に同一値を設定 → ユーザー問い合わせ時にtraceIdでVercel Logsを検索して当該リクエストの全ログを特定できる
- audit_logs・battle_logsの行にもtrace_id列を持たせ、DBログとconsoleログを突合可能にする

---

## 4. ログ種別ごとの設計

### 4.1 ログ種別一覧表

| # | 種別 | 出力先 | 内容 | 保持 | MVP |
|---|---|---|---|---|---|
| 1 | アプリケーションログ | console(JSON)→Vercel Logs | 業務イベント全般（usecase開始/完了、ドメインイベント）、debug/info/warn/error | Vercel Logsの保持期間（Hobby約1時間/Pro 1日〜。重要イベントはDBログ側で担保） | ○ |
| 2 | APIアクセスログ | console(JSON)→Vercel Logs | **全API**: method / path / status / durationMs / apiId / userId / traceId / IP（丸め方針は4.3） | 同上 | ○ |
| 3 | 認証ログ | console(JSON)＋失敗・ロックはaudit_logsにも記録 | ログイン成功（info）/ 失敗（info, 理由コード）/ 5回失敗ロック発動（warn）/ ログアウト / ゲスト開始 / ゲスト引き継ぎ / 退会 | console: Vercel準拠 / audit_logs: 1年 | ○ |
| 4 | エラーログ | console(JSON, level=error)→Vercel Logs | errorCode / スタックトレース / traceId / apiId。**error_logsテーブルは作らない（DEC-020）** | Vercel準拠（将来Sentryで長期化） | ○ |
| 5 | 監査ログ | **audit_logsテーブル** | 通貨増減（currency_transactionsへの記録と対で）/ 退会 / ゲスト引き継ぎ / 永続強化購入 / キャラ解放 / 管理操作（将来）/ 不正検知。列: id, user_id, action, target_type, target_id, details(JSONB), trace_id, ip_hash, created_at | 1年（cron削除） | ○ |
| 6 | ゲーム進行ログ | dungeon_runsが兼ねる（status/seed/開始終了時刻/結果）＋分析用info log（console） | ラン開始（API-303）/ 終了（finalize: cleared・failed・retired、到達階層、所要時間、獲得量）| dungeon_runs: 無期限（finalized行は分析資産）/ console: Vercel準拠 | ○ |
| 7 | 戦闘ログ | **battle_logsテーブル** | 1戦闘1行（仮決定）: run_id, floor, node_id, enemy_codes(JSONB), turn_count, result(victory/defeat/flee), player_hp_before/after, damage_dealt/taken合計, rng_cursor_start/end, trace_id, created_at。ターン明細はdetails(JSONB)に要約 | **30日**（cron削除） | ○ |
| 8 | 報酬獲得ログ | console(info)＋通貨分はcurrency_transactions | 宝箱・戦闘ドロップ・イベント報酬・クリア報酬の内容（rewardType, items, gold, relicCode等）とpendingReward消込 | console: Vercel準拠 / 通貨分: 下記9 | ○ |
| 9 | 通貨増減ログ | **currency_transactionsテーブル** | ソウルシャード・（ラン外で発生する）通貨の全増減: user_id, currency_type(soul_shards), amount(±), balance_after, reason(run_clear/run_fail/run_retire/character_unlock/upgrade_purchase等), ref_type/ref_id(runId等), trace_id, created_at。※ラン内ゴールドはrun_state内で完結するため対象外（battle_logs/consoleで追跡） | 1年（以降は月次集計へ丸めて削除、仮決定） | ○ |
| 10 | 管理操作ログ | audit_logs（action=admin_*） | マスタデータ更新・お知らせ操作・アカウント操作。MVPは管理画面なし（DEC-013）のため土台のみ | 1年 | ×(将来・土台のみ) |
| 11 | 不正検知ログ | console(warn)＋audit_logs（action=anticheat_flag） | ERR_INVALID_ACTION / ERR_CONFLICT_VERSION多発 / ERR_DUPLICATE_REQUESTボディ不一致 / 候補外選択 / 逃走不可戦での逃走試行 / レート制限超過。details: errorCode, apiId, 試行内容の要約 | audit_logs: 1年 | ○ |

### 4.2 禁止事項（全ログ共通・レビュー必須項目）

以下は**いかなるログ（console・DBテーブル・details JSONB内を含む）にも出力してはならない**:

- パスワード（平文・ハッシュとも）
- セッショントークン・JWT・Idempotency-Keyの値・パスワード再設定トークン
- セッションID・auth_sessionsの識別子
- **メールアドレス**（ユーザー特定が必要な場合は必ずuserId=UUIDで代替する）
- Cookieヘッダの内容全般
- Authorizationヘッダ

補助規則:
- IPアドレス: 生値をログに残さない。レート制限・不正調査用に**ソルト付きハッシュ（ip_hash）**または末尾オクテット丸めで記録（仮決定: audit_logsはip_hash、consoleアクセスログは丸めIP）
- リクエストボディ: 認証系API（API-001/002/005/006/008）はボディを一切ログしない。その他APIもボディ全文は記録せず、必要フィールドのみdetailsに転記

### 4.3 details内の機微情報マスク方針

- ロガー共通処理で、詳細オブジェクトのキー名に対する**拒否リストマスク**を必ず適用する: `password, token, secret, session, cookie, authorization, email, idempotencyKey` に部分一致するキーは値を `"[MASKED]"` に置換
- 未知の入力（例外メッセージ・外部ライブラリのエラー）にメールアドレス形式の文字列（`/\S+@\S+\.\S+/`）が含まれる場合も `"[MASKED_EMAIL]"` に置換
- マスク処理の単体テストを必須とする（21_Test_Design.mdのセキュリティテストに含める）

---

## 5. 監視設計

### 5.1 ヘルスチェック

- エンドポイント: `GET /api/v1/health`（認証不要、レート制限対象外、CORE_SPEC API一覧外の運用エンドポイント）
- 検査内容: (1) プロセス応答 (2) DB接続確認（`SELECT 1`、タイムアウト3秒） (3) マスタデータバージョン取得可否（master_data_versions 1行read）
- 応答: 正常 `200 {"status":"ok","db":"ok","timestamp":...}` / DB不通 `503 {"status":"degraded","db":"error"}`。内部情報（接続文字列・バージョン詳細）は返さない
- メンテナンス中（maintenance_settings有効時）も200を返しつつ `"maintenance":true` を含める（監視上はダウン扱いにしない、仮決定）

### 5.2 計測基盤

| ツール | 用途 | MVP |
|---|---|---|
| Vercel Logs | 構造化ログ集約・traceId検索 | ○ |
| Vercel Analytics | ページビュー・ユーザー動向 | ○ |
| Vercel Speed Insights | Core Web Vitals（LCP 3秒目標の実測） | ○ |
| UptimeRobot 無料枠（仮決定） | /api/v1/health の外形監視（5分間隔） | ○ |
| Neonダッシュボード | DB CPU・接続数・ストレージ | ○（手動確認・週次） |
| Sentry + Slack通知 | エラートラッキング・アラート集約 | ×(将来) |

### 5.3 監視項目と閾値表

| 項目 | 計測方法 | 警告閾値 | 重大閾値 | 対応 |
|---|---|---|---|---|
| APIエラー率（5xx/全リクエスト） | Vercel Logs（level=error集計） | 1%超（10分間） | 5%超 | traceIdで直近errorログ調査。デプロイ起因ならロールバック |
| API p95応答時間 | アクセスログdurationMs集計 | 500ms超（戦闘系800ms超）が10分継続 | 2倍超 | Neon負荷・コールドスタート・N+1を調査 |
| 5xx発生 | Vercel Logs | 発生の都度（error 1件〜） | 同一errorCode 10件/10分 | エラーログのスタックトレース調査 |
| ヘルスチェック失敗 | UptimeRobot | 1回失敗 | 2回連続失敗（=ダウン扱い） | Vercel/Neonステータスページ確認→インシデント対応 |
| 認証失敗急増 | 認証ログ（login_failed集計） | 100件/時（仮決定） | 500件/時 | ブルートフォース疑い。ip_hash上位を確認しブロック検討 |
| 不正検知warn急増 | anticheat_flag集計 | 同一userIdで20件/時（仮決定） | 100件/時 | audit_logsで行動追跡、必要ならアカウント凍結（将来機能） |
| DBストレージ | Neonダッシュボード | 無料枠の70% | 90% | battle_logs/audit_logsの削除ジョブ確認、プラン検討 |
| DB接続数 | Neonダッシュボード | 上限の70% | 90% | Prisma接続プール設定・PgBouncer（Neon pooler）確認 |
| Web Vitals LCP | Speed Insights | p75 3秒超 | p75 5秒超 | バンドル・画像最適化 |

### 5.4 通知

- MVP:
  - Vercelの標準通知（デプロイ失敗・関数エラー）→ 登録メール
  - UptimeRobot無料枠（仮決定）→ ヘルスチェックダウンをメール通知
  - エラー率・p95の閾値監視はMVPでは自動化せず、週次の手動レビュー（Vercel Logs/Analytics確認のルーチン化）で代替。GitHub Actionsの夜間ジョブでLogs APIを叩く自動集計は将来課題
- 将来: Sentry導入（DEC-020の将来方針）でエラー集約・リリース紐付け・Slack通知。閾値超過アラートもSentry/Slackへ一本化

### 5.5 ログ肥大化対策（削除ジョブ）

Vercel Cron（`vercel.json`のcrons設定）+ 認証付き内部エンドポイント（`CRON_SECRET`ヘッダ検証）で実行する:

| ジョブ | スケジュール | 内容 |
|---|---|---|
| cleanup-battle-logs | 毎日 04:00 JST | `battle_logs` の created_at が30日超の行を削除（1回のバッチ上限1万行、残があれば翌日continue） |
| cleanup-audit-logs | 毎週日曜 04:30 JST | `audit_logs` の created_at が1年超の行を削除 |
| cleanup-currency-tx | 毎月1日 05:00 JST | `currency_transactions` の1年超の行を月次集計テーブルに丸めて削除（仮決定。集計テーブル定義は12_Database_Design.md改訂で追加） |
| cleanup-stale-runs | 毎日 04:15 JST | status=active のまま更新が30日超のdungeon_runsをretired扱いでクローズ（放置ラン対策、仮決定） |

- 削除ジョブ自体の実行結果（削除行数・所要時間）をinfoログ出力し、失敗時はerrorログ（=Vercel通知対象）
- Vercel Cron無料枠（Hobby: cron数・実行時間制限）を考慮し、ジョブは合計4本以内に収める

---

## 6. ダッシュボード・分析（将来の土台）

MVPでは専用ダッシュボードを作らないが、将来の分析（勝率・離脱ポイント・バランス調整）に必要なデータをMVP時点から蓄積する:

- **蓄積済みデータで賄う分析**:
  - 勝率・平均到達階層: dungeon_runs（status, run_stateの最終floor, character code, 所要時間）をSQLで集計
  - 戦闘難易度: battle_logs（enemy_codes × result × turn_count）で「どの敵で負けているか」を集計
  - 経済バランス: currency_transactions（reason別のソウルシャード流入出）
- **イベントログ設計の土台（将来導入）**: 分析用info logのmessageを `analytics.<event>` 名前空間で統一しておく（例: `analytics.node_selected`, `analytics.skill_chosen`, `analytics.shop_purchased`, `analytics.run_abandoned`）。details構造（runId, floor, nodeType, choiceCode等）をMVP時点でスキーマ化（`src/server/services/logger.ts` にイベント型定義）しておき、将来はconsole出力先をBigQuery/Tinybird等の分析基盤へ二重送信するだけで移行できるようにする（仮決定）
- 離脱ポイント分析: `analytics.node_selected` と finalizeの有無を突合し、「どの階層・ノードタイプで再開されなくなるか」を将来算出する

---

## 未決事項

| ID | 内容 | 期限目安 |
|---|---|---|
| ISSUE-230 | Vercel Logsの保持期間がプラン依存（Hobbyは実質数時間）のため、外部ドレイン（Log Drains: Axiom/BetterStack等の無料枠）を追加するか | 本番公開前 |
| ISSUE-231 | UptimeRobot採用の最終確認（代替: BetterStack Uptime / Vercel Checks）。仮決定のまま公開はしない | 本番公開前 |
| ISSUE-232 | ip_hashのソルト運用（ローテーション周期・環境変数管理） | 実装時 |
| ISSUE-233 | currency_transactionsの月次集計テーブル定義と丸め粒度（12_Database_Design.md側の改訂要否） | 公開後3ヶ月以内 |
| ISSUE-234 | battle_logsの粒度（1戦闘1行の仮決定 vs ターン単位の別行）。不正調査でターン明細が必要になった場合の拡張方式 | クローズドテスト後 |
| ISSUE-235 | エラー率・p95閾値監視の自動化（GitHub Actions夜間集計 vs Sentry前倒し導入） | 公開後1ヶ月 |

## 実装時の注意点

- ロガーは必ず共通モジュール（`src/server/services/logger.ts`）経由とし、マスク処理（4.3）をロガー内部で強制する。呼び出し側の善意に依存しない
- domain層（純粋関数）にはロガーを直接持ち込まない。domainはイベント・計算結果を返し、usecase層でログ出力する（テスト容易性の維持、21_Test_Design.md参照）
- audit_logs・currency_transactionsへの書き込みは**業務トランザクションと同一トランザクション**で行う（付与とログの不整合を防ぐ）。consoleログはトランザクション外でよい
- Vercelのserverless環境では`console.log`が即時flushされる保証を確認し、応答返却後の非同期ログ（`waitUntil`外）は失われ得ることに注意する
- traceIdの`AsyncLocalStorage`はNode.jsランタイムでのみ動作確認する（Edgeランタイム併用時は挙動差異あり。MVPのAPIはNodeランタイムに統一、仮決定）
- battle_logsのrng_cursor_start/endは不正調査の要（同一seed+カーソルで戦闘を完全再現できる）。省略しない
- Cronエンドポイントは`CRON_SECRET`検証を必ず入れる（無認証だと外部から削除ジョブを叩かれる）。また削除はcreated_atインデックス前提のため、12_Database_Design.md側でインデックス定義を確認する
- ログのJSONシリアライズで循環参照・巨大オブジェクト（run_state全体等）を出力しない。details上限は8KB目安で切り詰め（仮決定）

## 関連設計書

- CORE_SPEC（共通仕様: エラーコード・API一覧・テーブル一覧・DEC-020）
- 04_Non_Functional_Requirements.md（p95・稼働率目標）
- 10_System_Architecture.md（Vercel/Neon構成・ランタイム）
- 12_Database_Design.md（audit_logs / battle_logs / currency_transactions / dungeon_runsの定義・インデックス）
- 13_API_Design.md（エラー共通形式・traceId・レート制限）
- 21_Test_Design.md（ログ書き込みの結合テスト・マスク処理テスト）
- 22_Security_Design.md（不正検知・ブルートフォース対策・IP取り扱い）
- 24_CI_CD_Design.md（Vercel Cron設定・デプロイ通知）
