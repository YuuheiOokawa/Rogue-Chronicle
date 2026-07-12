# 04. 非機能要件定義書 — Rogue Chronicle

## 目的

本書は「Rogue Chronicle」（ローグライトRPG / Next.js + Vercel + Neon PostgreSQL）の非機能要件を、
測定可能な数値目標付きで定義する。個人開発・MVP先行の前提に立ち、各項目を
「目標値 / 測定方法 / MVPでの対応 / 将来対応」で整理する。数値は CORE SPEC §12 と一致させている。

## 前提条件

- ホスティング: Vercel（サーバーレス関数）、DB: Neon（サーバーレスPostgreSQL）
- 想定規模（MVP〜公開初期）: DAU 100 / 同時接続 100 / ピークリクエスト 10 req/s 程度
- 運用体制: 開発者1名（専任の運用担当なし）。この制約が可用性・監視目標の上限を規定する

---

## 1. 性能

| 項目 | 目標値 | 測定方法 | MVPでの対応 | 将来対応 |
|---|---|---|---|---|
| 初期表示（LCP） | 通常画面3秒以内（4G回線・ミッドレンジスマホ） | Lighthouse Mobile / Vercel Speed Insights | RSCによる初期データ同梱、画像を持たないCSS主体のUI、コード分割 | 画像アセット導入時にnext/image・プリロード最適化 |
| 操作応答 | 1秒以内（タップ→画面反応。演出中の先行入力も受付） | E2E計測（Playwright trace） | 楽観的UI（スピナー即時表示）、TanStack Queryキャッシュ | 楽観更新の適用範囲拡大 |
| API応答 | p95 500ms以内（参照系）/ 戦闘系（API-402）はターン解決込みでp95 800ms以内 | 構造化ログのdurationMs集計 | domain純関数の軽量計算・クエリ数上限2（N+1禁止） | 負荷試験（k6）で回帰確認、Neonオートスケール調整 |
| コールドスタート | 初回リクエスト+1.5秒以内の追加遅延に収める | Vercelログ | Prismaクライアントの軽量化・依存最小化 | Fluid Compute / keep-warm検討 |
| バンドルサイズ | 初期JS 300KB(gzip)以内 | next build 出力 | ゲームエンジン不採用（DEC-009）、動的import | 演出ライブラリ導入時に再測定 |
| Lighthouse | Mobile Performance 80以上（リリース判定基準） | CI外の手動測定（リリース前必須） | 26_Release_Plan.md のチェックリストに組込 | CI自動化（LHCI） |

## 2. 可用性

| 項目 | 目標値 | 測定方法 | MVPでの対応 | 将来対応 |
|---|---|---|---|---|
| 稼働率 | 月間99.5%（≒3.6h/月の停止許容。個人開発の現実値。**99.9%は将来目標**） | UptimeRobot（/api/v1/health 5分間隔） | Vercel+Neonのマネージド可用性に依拠 | 有料プラン・マルチリージョン検討 |
| 計画メンテナンス | 月2回以内・深夜帯・事前告知（announcements + maintenance_settings） | メンテ記録 | メンテモード（503 + SCR-009）実装 | メンテ不要のローリング更新（§DB後方互換） |
| 障害時挙動 | DB接続不可→ERR_INTERNAL即時応答（ハングさせない）。ラン進行はサーバー保存済みのため**データ損失ゼロで再開可能** | 障害訓練（手動） | 接続タイムアウト5秒・API全体10秒 | Sentryアラート連動 |

## 3. 信頼性・データ保全

| 項目 | 目標値 | 測定方法 | MVPでの対応 | 将来対応 |
|---|---|---|---|---|
| RPO（データ損失許容） | 24時間（バックアップ由来）。ただし通常運用ではNeon PITRにより実質ほぼ0 | リストア訓練 | Neon PITR 7日 + 日次論理バックアップ（pg_dump→GitHub Actions Artifact/外部保管） | バックアップの外部ストレージ二重化 |
| RTO（復旧時間） | 4時間以内 | リストア訓練（公開前に1回実施必須） | 手順書を 26_Release_Plan.md に記載 | 自動リストア検証 |
| データ整合性 | 通貨残高と currency_transactions 合計の不一致0件 | 週次突合バッチ（将来）/ 手動SQL | 1トランザクション強制・楽観ロック・冪等キー（12_Database_Design.md §5） | 突合バッチの自動化・アラート |
| セーブデータ破損 | 破損検知時、スナップショット（直近3世代）から復旧成功率100% | TC（21_Test_Design.md） | validateRunState + dungeon_run_snapshots | 破損原因のSentry収集 |

## 4. セキュリティ

| 項目 | 目標値・基準 | MVPでの対応 | 将来対応 |
|---|---|---|---|
| 入力検証 | **全APIでサーバー側Zod検証**（`.strict()`）。クライアント検証はUX目的のみ | 実装必須（13_API_Design.md） | スキーマのOpenAPI同期検証 |
| 戦闘結果の信頼性 | クライアントから数値（ダメージ・報酬・通貨）を一切受け取らない（DEC-007） | サーバー権威実装 | 異常検知ログの自動監視 |
| 認証 | パスワードbcrypt(cost 12)、8文字以上英数、ログイン5回失敗で15分ロック | 実装必須（14_Authentication_Design.md） | WebAuthn・OAuth追加 |
| セッション | JWT httpOnly/Secure/SameSite=Lax、アクセストークン24h・最大30日 | Auth.js設定 | デバイス管理画面 |
| 通信 | 全通信HTTPS（HSTS）、CSP・X-Frame-Options等のセキュリティヘッダ | next.config設定（22_Security_Design.md の具体値） | CSPレポート収集 |
| 脆弱性管理 | Dependabot週次 + criticalは72時間以内に対応 | GitHub設定 | SAST（CodeQL）導入 |
| 個人情報 | 保有はメールアドレスのみ（最小化）。ログへの出力禁止（23_Logging_Monitoring.md） | 設計で担保 | プライバシーポリシーの定期見直し |

## 5. 保守性

| 項目 | 目標値 | MVPでの対応 |
|---|---|---|
| テストカバレッジ | domain層90% / usecase80% / 全体70%（21_Test_Design.md） | CIでカバレッジ閾値チェック |
| 型安全 | TypeScript strict、`any` 禁止（ESLintエラー） | 初期設定で強制 |
| ドキュメント同期 | 設計変更はdocs更新+Decision Log記録をPR必須項目に | PRテンプレートのチェック項目 |
| デプロイ | main pushから10分以内に本番反映、ロールバックは5分以内（Vercel Instant Rollback） | Vercel Git連携 |
| マスタデータ変更 | シード再投入のみで完結（コード変更不要）。skill_effects等のデータ駆動設計 | 18_Skill_Design.md の設計で担保 |

## 6. 拡張性

| 項目 | 方針 |
|---|---|
| コンテンツ追加 | ダンジョン・スキル・レリック・敵はマスタ追加のみで拡張可能（effect_typeハンドラ設計） |
| 機能拡張 | ゲームモード（デイリー/エンドレス等）はdungeons.generation_configとdifficultyの追加で対応できる生成設計 |
| 規模拡張 | DAU 1,000まではNeonオートスケール+Vercelで構成変更なしに耐える見込み。超過時はRedis（レート制限・キャッシュ）追加 |
| API | /api/v1 のバージョン付け。破壊的変更は /api/v2 を新設し並走 |

## 7. 移植性

| 項目 | 方針 |
|---|---|
| PWA/ネイティブ化 | REST API採用（DEC-014）によりクライアント差し替えが可能。domain層はブラウザ非依存 |
| DB移行 | repository層で吸収（Prisma依存をserver層に限定）。ただしJSONB利用のためPostgreSQL系を前提 |
| ホスティング移行 | Vercel固有機能はCron・環境変数に限定し、Next.js標準機能を優先使用 |

## 8. 操作性・アクセシビリティ

| 項目 | 目標値 | 対応 |
|---|---|---|
| タップ領域 | 最小44×44px | 08_UI_UX_Design.md のボタン規格（高さ48px） |
| 色コントラスト | WCAG 2.1 AA（4.5:1） | デザイントークンで担保・色覚アシスト設定（user_settings.colorAssist） |
| 色非依存 | 状態表現は色+形状+テキストの併用 | バフ▲/デバフ▼、レア度は色+枠形状 |
| 演出抑制 | prefers-reduced-motion 尊重 + 画面揺れOFF設定 | user_settings.screenShake |
| フォント | 最小14px、数値は等幅 | デザイントークン |
| キーボード操作 | PC: Tab移動・Enter決定が主要フローで可能 | フォーカスリング必須 |
| スクリーンリーダー | 主要画面にaria-label / role / live region（戦闘ログ） | 実装ガイドライン |

## 9. 監視・ログ・障害対応

| 項目 | 目標値 | MVPでの対応 | 将来対応 |
|---|---|---|---|
| ヘルスチェック | /api/v1/health（DB接続確認込み）5分間隔・3回連続失敗で通知 | UptimeRobot無料枠（仮決定） | Sentry/Better Stack |
| エラー監視 | 5xxエラー率1%超（15分窓）で検知 | Vercelログ+通知 | Sentryアラート |
| 重大エラー | ERR_INTERNAL・ERR_RUN_STATE_INVALID・整合性違反は全件warn/errorログ+traceId | 構造化ログ（23_Logging_Monitoring.md） | 不正検知ダッシュボード |
| 障害対応 | 一次切り分け手順書（Vercel status→Neon status→直近デプロイ→ロールバック）を26_Release_Plan.mdに整備 | 手順書 | ポストモーテム様式 |
| ログ保持 | Vercelログ（プラン依存・短期）+ 監査系はDB（audit_logs 1年 / battle_logs 30日 / currency_transactions 無期限） | 実装 | 外部ログ基盤 |

## 10. 不正対策・チート対策（詳細は 22_Security_Design.md）

| 項目 | 目標 | MVPでの対応 |
|---|---|---|
| 戦闘結果改ざん | 構造的に不可能（数値を受け取らない） | サーバー権威（DEC-007） |
| 報酬多重取得 | 0件（DB制約で最終遮断） | 冪等キーUNIQUE + status一方向遷移 + claimedフラグ |
| リプレイ攻撃 | 同一リクエスト再送は同一応答（状態は進まない） | Idempotency-Key + version楽観ロック |
| 通貨改ざん | クライアントから通貨値を受理しない | API設計で担保 |
| ボット | MVPはレート制限のみ（完全対策はしない・被害範囲が自己完結のため優先度低） | レート制限 | 異常検知・Turnstile（将来） |

## 11. レート制限・タイムアウト・リトライ・同時実行

| 項目 | 目標値 |
|---|---|
| レート制限（認証系） | 5回/分/IP（429 + Retry-After） |
| レート制限（一般API） | 60回/分/ユーザー |
| ログイン試行 | 5回連続失敗で15分アカウントロック（ERR_AUTH_LOCKED 423） |
| APIタイムアウト | 10秒（Vercel関数上限内）。DBクエリ5秒・トランザクション5秒 |
| クライアントリトライ | 冪等キー前提で最大3回・指数バックオフ（2s/4s/8s）。非冪等API（GET以外で冪等キー無し）は自動リトライ禁止 |
| 同時実行制御 | dungeon_runs.version / player_currencies.version の楽観ロック。同時アクティブラン1つは部分UNIQUEインデックスで保証 |
| 多重ログイン | 許可（後勝ち）。ラン操作の競合はERR_CONFLICT_VERSIONで検知・再同期 |

## 12. セッション管理・データ保持

| 項目 | 目標値 |
|---|---|
| セッション | アクセストークン24h、スライド更新で最大30日。明示ログアウトで即失効 |
| ゲスト | Cookie保持。最終アクセス180日で匿名ゲスト削除（ISSUE-005仮採用） |
| 退会 | 論理削除→30日後に物理削除（CASCADE）。currency_transactionsは匿名化して保持（監査、仮決定） |
| データ保持期間一覧 | 12_Database_Design.md §6 の表を正とする |

---

## 未決事項

- 稼働率99.5%→99.9%への引き上げ時期（有料プラン移行と連動。正式公開後のDAU実績で判断）。
- 日次論理バックアップの保管先（GitHub Actions Artifact / Cloudflare R2 / ローカル）。Phase 12までに決定。
- 退会ユーザーのcurrency_transactions匿名化保持は仮決定。プライバシーポリシー文面と併せて法的観点を確認。
- 負荷試験の実施環境（Neonブランチ+Vercel Previewで行うか）はPhase 11で決定。

## 実装時の注意点

- 性能目標はCIでの自動測定が難しいものが多い。**リリース判定チェックリスト（26_Release_Plan.md）に手動測定項目として必ず転記**すること。
- durationMs・traceIdを含む構造化ログは最初のAPI実装（Phase 2）から共通ミドルウェアとして入れること。後付けは漏れる。
- レート制限はVercelサーバーレスでインメモリ不可。実装方式（DBベース固定ウィンドウ）は13_API_Design.md未決事項と同期。
- 「99.5%」等の目標値は利用者への約束（SLA）ではなく内部目標（SLO）である。利用規約にはベストエフォートであることを明記。

## 関連設計書

- [02_System_Requirements.md](./02_System_Requirements.md) — 業務要件・権限
- [22_Security_Design.md](./22_Security_Design.md) — セキュリティ・不正対策の詳細
- [23_Logging_Monitoring.md](./23_Logging_Monitoring.md) — ログ・監視の実装設計
- [12_Database_Design.md](./12_Database_Design.md) — 保持期間・整合性・ロック
- [26_Release_Plan.md](./26_Release_Plan.md) — リリース判定基準・障害対応手順
