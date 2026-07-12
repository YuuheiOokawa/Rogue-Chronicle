# 22. セキュリティ・不正対策設計書（Security Design）

- 対象プロダクト: Rogue Chronicle（ローグライトRPG）
- 目的: 本書はWebブラウザゲームとして想定される不正・攻撃の脅威モデル、実装レイヤ別の対策、不正検知ログ、MVPと将来強化の区分を定義する。エラーコード・テーブル名・API IDはCORE SPECと完全一致させる。
- 関連文書: 14_Authentication_Design.md / 15_Save_Data_Design.md / 13_API_Design.md / 12_Database_Design.md

---

## 1. 設計原則

1. **サーバー権威（DEC-007）**: 戦闘計算・報酬抽選・乱数・通貨増減は全てサーバーで実行。クライアントは「正規の選択肢の中からどれを選んだか」のみを送信する。
2. **選択肢内なら許容、選択肢外は全拒否**: curl等でAPIを直接叩く行為自体は防げないため、**正規UIから可能な操作と同じ結果しか得られないなら許容する**設計とする。逆に、提示していない選択肢・現在phaseで不可能な操作は全てサーバー検証で ERR_INVALID_ACTION(422) 等により拒否する。「クライアントを信頼しない」が唯一の防衛線。
3. **クライアントから数値を受け取らない**: ダメージ・通貨額・ドロップ内容・タイムスタンプ等の「結果」をクライアントから受け取るAPIは一切作らない。
4. **多層防御**: 入力検証（Zod）→ 認証 → 認可 → phase/状態遷移検証 → 楽観ロック → 冪等キー → DB制約（UNIQUE/CHECK）の順に重ねる。最後の砦はDB制約。

---

## 2. 脅威モデル: 想定される不正と対策マトリクス

| # | 脅威 | 手口 | MVP対策 | 将来対策 | 検知方法 |
|---|---|---|---|---|---|
| T-01 | クライアント改ざん | DevToolsでJS書き換え、メモリ上のstats/gold改変、React state操作 | サーバー権威（DEC-007）。クライアント表示値はサーバー応答の写しにすぎず、改変しても次のAPI応答で上書きされる | 難読化は行わない方針を維持（効果薄のため） | 不要（実害なし）。表示と応答の乖離はサポート問い合わせで判明 |
| T-02 | API直接呼び出し | curl/PostmanでUIを介さず操作 | 正規の選択肢内なら許容（§1原則2）。選択肢外・phase外は全APIでサーバー検証し ERR_INVALID_ACTION(422) | 異常な呼び出しパターンの行動分析 | ERR_INVALID_ACTION発生のaudit_logs記録（§5） |
| T-03 | 所持通貨改ざん | リクエストにgold/soulShards値を混入、購入額の負数指定 | 通貨値をクライアントから受け取らない（購入APIは商品slotIndexのみ受理）。Zodで `.strict()` により未知フィールド拒否。減算はサーバーが run_state.gold / player_currencies から計算し、負残高はCHECK制約で拒否 → ERR_INSUFFICIENT_GOLD / ERR_INSUFFICIENT_SHARDS(422) | - | currency_transactions（全増減ログ）と残高の日次突合バッチ |
| T-04 | 報酬多重取得 | 報酬受領APIの連打・並行送信・リトライ悪用 | pendingReward状態遷移（claimed=false→trueと付与を同一TX）+ Idempotency-Key + currency_transactions の UNIQUE(user_id, idempotency_key)。2回目以降は ERR_REWARD_ALREADY_CLAIMED(409) または保存済み応答の再送 | - | UNIQUE違反・ERR_REWARD_ALREADY_CLAIMED のaudit_logs記録 |
| T-05 | 戦闘結果改ざん | 「勝った」「与ダメージ9999」等の結果送信 | 結果を受け取るAPIが存在しない（DEC-007）。API-402は行動種別・スキルcode・対象indexのみ受理し、ダメージ・命中・撃破判定は全てサーバー計算（seed+rngCursorで再現可能、DEC-019） | battle_logsのリプレイ検証ツール | battle_logs（30日保持）とseed/rngCursorの再計算突合 |
| T-06 | リクエスト再送・リプレイ攻撃 | 成功した報酬付与リクエストの再送、古いリクエストの再送 | Idempotency-Key（同一キーは保存済み応答を返し再適用しない）+ run_state.version楽観ロック（古いversion前提の操作は ERR_CONFLICT_VERSION(409)） | - | ERR_DUPLICATE_REQUEST / ERR_CONFLICT_VERSION の頻発をaudit_logsで監視 |
| T-07 | タイムスタンプ改ざん | クライアント時刻を偽装した時限要素の不正（将来のデイリー等） | サーバー時刻（DB now()）のみ使用。クライアントから時刻を受け取るAPIを作らない | デイリー導入時もサーバー時刻+ユーザーTZ設定で判定 | 不要（入力経路なし） |
| T-08 | セーブデータ改ざん | LocalStorage/Cookieのセーブデータ書き換え、古いセーブの復元 | ゲーム進行はサーバー保存のみ（15_Save_Data_Design.md §1）。LocalStorageに進行データを置かない（禁止リスト）。run_stateを受け取るAPIなし。巻き戻しはsnapshot復元処理のみ（version単調増加） | - | validateRunState失敗（ERR_RUN_STATE_INVALID）のaudit_logs記録 |
| T-09 | 連打・多重クリック | ボタン連打での多重リクエスト | クライアント: 応答までボタンdisabled（UX対策）。サーバー: 冪等キーで二重適用防止（真の防衛線はサーバー側） | - | 同一冪等キー衝突頻度の監視 |
| T-10 | ボット・自動化 | スクリプトによる自動周回・大量アカウント作成 | レート制限のみ（認証系5回/分/IP、その他60回/分/ユーザー、ERR_RATE_LIMITED(429)）。PvP・ランキング・課金が無いMVPでは実害が小さいと整理 | 異常検知（プレイ速度・稼働時間の統計監視）、Cloudflare Turnstile（登録・ゲスト開始時）、IP単位のアカウント作成上限 | レート制限超過ログ、1日あたりAPI呼び出し数の外れ値検出（将来） |
| T-11 | 多重ログイン悪用 | 複数端末並行操作による状態競合の悪用（同一報酬の並行受領等） | dungeon_runs.version楽観ロックで後勝ち（正確には先コミット勝ち）。負けた操作は ERR_CONFLICT_VERSION(409)。報酬はT-04の対策で二重付与不可 | セッション数上限の導入検討 | ERR_CONFLICT_VERSIONの異常頻発ユーザーの監視 |
| T-12 | 管理APIへの不正アクセス | 一般ユーザー/未認証での管理API呼び出し | users.role（user/admin）チェックを管理API全てに実装（DEC-013: MVPは土台のみ）。role≠adminは ERR_FORBIDDEN(403)。管理者アカウントはシードで1件のみ作成 | /admin配下へのIP制限（Vercel/ミドルウェア）、監査ログ強化、2FA | 管理APIへの403発生を全件audit_logs記録 |
| T-13 | 認証攻撃（総当たり・資格情報スタッフィング） | パスワード総当たり、漏洩リスト流用 | 5回失敗で15分ロック（users.failed_attempts + locked_until、ERR_AUTH_LOCKED(423)）+ レート制限5回/分/IP + bcrypt cost12 | パスワード漏洩DB照合（HIBP）、2FA | 失敗回数・ロック発生のaudit_logs記録、同一IPからの多アカウント失敗監視 |
| T-14 | セッション窃取 | XSSによるCookie窃取、盗聴 | httpOnly/Secure/SameSite=Lax Cookie + HSTS + CSP（§4）+ React自動エスケープ | デバイスフィンガープリントによる異常セッション検知 | 同一セッションのIP/UA急変記録（auth_sessions.last_seen_at系、将来） |
| T-15 | インジェクション（SQL/NoSQL） | 入力欄・APIパラメータへのSQL断片混入 | Prismaパラメタライズドクエリのみ（$queryRawUnsafe禁止）+ Zod全API入力検証 | SASTのCI組込み | CIの静的検査、コードレビュー |

---

## 3. 実装レイヤ別対策

### 3.1 入力検証（Zod）

- **全APIの入力（body / query / path / header）をサーバー側でZod検証**する（04章の非機能要件と一致）。スキーマは src/schemas/ に集約し、クライアントのReact Hook Formと共用する（ただしサーバー検証が正）。
- 全スキーマに `.strict()` を指定し、未知フィールドを拒否（T-03対策）。
- 数値は `.int().min(...).max(...)`、codeは既知マスタ値のenum照合（例: スキルcodeは所持スキル内のみ許可＝Zod後にdomain層で検証）。
- Idempotency-Key はUUID v4形式をZod検証。

### 3.2 認可（全APIでuser_id一致検証）

- 認証必須APIは、JWTの `sub`（user_id）を唯一の主体識別子とし、**リクエストパラメータでuser_idを受け取らない**（IDOR構造的排除）。
- リソースアクセスは常に `WHERE user_id = :authenticatedUserId` を含める（dungeon_runs, player_*, user_settings 等）。repositories層の共通メソッドで強制し、user_id条件なしのクエリをコードレビューで禁止。
- `/runs/current` 系は「認証ユーザーの status=active なラン」をサーバーが特定する（runIdをクライアントから受けない）。
- 管理APIは role=admin チェックをミドルウェア＋usecase双方で実施（二重チェック）。

### 3.3 HTTPセキュリティヘッダ（next.config.ts headers() で全応答に付与）

| ヘッダ | 値（MVP具体値） |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` （注: `script-src 'unsafe-inline'` はNext.jsインラインスクリプト対応の暫定。将来nonce方式へ移行。仮決定 DEC-221） |
| X-Frame-Options | `DENY`（frame-ancestorsと二重指定、旧ブラウザ用） |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |
| Cache-Control（API応答） | `no-store`（認証済みデータのキャッシュ禁止） |

### 3.4 依存パッケージ管理

- Dependabot（GitHub Actions連携）を有効化: セキュリティアップデートは自動PR、週次でバージョン更新PR。
- `npm audit` をCIに組み込み、High以上の脆弱性でCI失敗（仮決定 DEC-222）。
- lockfile（package-lock.json）必須、CIは `npm ci` のみ使用。

### 3.5 Secrets管理

- 本番Secrets（DATABASE_URL, AUTH_SECRET, 将来のRESEND_API_KEY）は**Vercel環境変数のみ**に保存。リポジトリへのコミット禁止。
- リポジトリには `.env.example`（キー名とダミー値のみ）を置き、`.env*` は .gitignore 登録。
- クライアント公開値は `NEXT_PUBLIC_` プレフィックスのみ。Secretsに `NEXT_PUBLIC_` を付けないことをレビュー観点化。
- ローテーション: AUTH_SECRET漏洩時は即時差し替え（全セッション失効を許容）。

---

## 4. 不正検知ログ（audit_logs）

### 4.1 記録対象

以下のイベント発生時に audit_logs テーブルへ記録する（テーブル定義は 12_Database_Design.md）。

| イベント種別 | 対応エラー/操作 |
|---|---|
| invalid_action | ERR_INVALID_ACTION(422) 発生（phase外操作・選択肢外の値） |
| run_state_invalid | ERR_RUN_STATE_INVALID(409) 発生（破損 or 改ざん疑い） |
| reward_conflict | ERR_REWARD_ALREADY_CLAIMED / ERR_DUPLICATE_REQUEST 発生 |
| version_conflict | ERR_CONFLICT_VERSION 発生 |
| auth_failure | ログイン失敗・ERR_AUTH_LOCKED発生 |
| admin_access_denied | 管理APIへの403 |
| account_lifecycle | 退会、物理削除バッチ、snapshot復元、手動データ修正 |

- 記録項目: `id, user_id(nullable), event_type, error_code, api_id, request_summary(JSONB, 秘匿情報除去済み), ip_hash, user_agent, trace_id, created_at`
- パスワード・トークン・emailは request_summary に**含めない**（LoggingModuleでマスキング）。

### 4.2 アラート（将来）

- 同一ユーザーで invalid_action / run_state_invalid / reward_conflict の合計が**10件/時を超過**した場合をアラート対象とする（将来: Vercel Cron集計→メール通知。MVPではクエリを用意するのみ）。
- アラート後の対応（将来運用フロー案）: audit_logs調査 → battle_logs/seed再計算で改ざん確認 → 該当ユーザーの一時凍結（users.status=suspended、将来ステータス追加）。

---

## 5. MVP対策と将来強化の区分表

| 領域 | MVPで実装 | 将来強化 |
|---|---|---|
| ゲーム進行の不正 | サーバー権威 / phase・選択肢検証 / 冪等キー / 楽観ロック / DB UNIQUE・CHECK制約 | battle_logsリプレイ自動検証、統計的異常検知 |
| 認証 | bcrypt cost12 / アカウントロック / レート制限 / httpOnly Cookie | 2FA、HIBP照合、Turnstile、OAuth |
| 通貨 | currency_transactions全増減ログ + UNIQUE冪等 | 残高突合バッチの自動化・アラート |
| ボット | レート制限のみ | 異常検知、Turnstile、IP別作成上限 |
| ヘッダ/インフラ | CSP（unsafe-inline暫定）/ HSTS / nosniff 等 §3.3全て | CSP nonce化、/adminへのIP制限 |
| 監視 | audit_logs記録 + 手動クエリ（DEC-020: Vercel標準ログ+構造化ログ） | Sentry導入、閾値アラート自動化（10件/時） |
| 依存管理 | Dependabot + npm audit CI | SAST/DAST、コンテナスキャン（ネイティブ化時） |

---

## 未決事項

| ID | 内容 |
|---|---|
| ISSUE-221 | CSPのnonce方式移行時期（Next.jsのミドルウェア実装コストと合わせて判断。DEC-221暫定） |
| ISSUE-222 | ユーザー凍結ステータス（users.status=suspended）の追加時期と凍結時のUX（MVPスキーマに列挙値だけ先行定義するか） |
| ISSUE-223 | ip_hash のハッシュ方式とソルト運用（プライバシーとレート制限・不正調査の両立） |
| ISSUE-224 | 異常検知の閾値詳細（10件/時は暫定値。運用データで再調整） |

## 実装時の注意点

- エラー応答（`{ errorCode, message, details, traceId, timestamp }`）の message にスタックトレース・SQL・内部パスを含めない。details はZod検証エラーのフィールド名程度に留める。
- ERR_INVALID_ACTION の判定は「Zod形式検証OKだが状態的に不可能」の層で行う。形式エラー（ERR_VALIDATION）と混同するとaudit_logsのシグナル純度が下がる。
- レート制限・冪等キー・楽観ロックの検証順序を全APIで統一する: 認証 → レート制限 → Zod → 冪等キー照合 → 認可(user_id) → version → phase/選択肢検証 → 実行。
- audit_logs書き込み失敗で本処理を失敗させない（ベストエフォート、ただしコンソール構造化ログには必ず残す）。
- currency_transactions の UNIQUE(user_id, idempotency_key) はNULL許容にしない（システム起因付与はシステム用キーを採番）。
- CSPは導入時にレポートオンリー（Content-Security-Policy-Report-Only）で1週間検証してから強制に切り替えると安全。
- Vercelのプレビュー環境にも本番同様のヘッダ・認証を適用し、プレビューURLからのデータ漏洩を防ぐ（プレビューは本番DBに接続しない）。

## 関連設計書

- 04_Non_Functional_Requirements.md（レート制限・目標値）
- 12_Database_Design.md（audit_logs / currency_transactions / 制約定義）
- 13_API_Design.md（エラー共通形式・Idempotency-Key仕様）
- 14_Authentication_Design.md（認証攻撃対策の詳細）
- 15_Save_Data_Design.md（サーバー権威保存・破損検知）
