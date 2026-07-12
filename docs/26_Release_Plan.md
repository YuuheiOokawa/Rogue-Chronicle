# 26. リリース計画書 — Rogue Chronicle

## 目的

本書は Rogue Chronicle の環境構成（local / Preview / Production）、Vercel・Neon の初回セットアップ手順、リリース判定基準、リリース手順とロールバック、メンテナンスモード運用、段階公開計画、障害対応の一次切り分け、コスト試算を定義する。ブランチ戦略（25_GitHub_Operation.md §3: main + develop、squash merge、Vercel Git連携デプロイ）と完全に整合させる。

## 関連文書

- CORE_SPEC（設計共通仕様）
- 25_GitHub_Operation.md（ブランチ戦略・CI/CD・Secret管理）
- 27_Roadmap.md（開発ロードマップ・リスク管理）
- 22_Security_Design.md（セキュリティチェック項目）
- 12_Database_Design.md（マイグレーション方針）
- 21_Test_Design.md（テストケース・E2Eフロー）

---

## 1. 環境構成

### 1.1 3環境の構成表（仮決定 DEC-260）

| 項目 | local | Preview | Production |
|---|---|---|---|
| 用途 | 開発・デバッグ | 統合確認・リリース前検証・β確認 | 本番（プレイヤー向け） |
| 対応ブランチ | feature/xxx（作業中） | `develop`（固定エイリアス）+ PRごとの一時URL | `main` |
| URL | http://localhost:3000 | https://develop-rogue-chronicle.vercel.app（仮。ISSUE-251） | https://rogue-chronicle.vercel.app → 将来独自ドメイン |
| デプロイ契機 | `pnpm dev` 手動 | develop へ push / PR 作成・更新（Vercel自動） | main へ push（Vercel自動） |
| DB（Neonブランチ） | Neon `dev` ブランチ or ローカルDocker PostgreSQL | Neon `develop` ブランチ | Neon `main` ブランチ |
| DBデータ | シードのみ。自由に破壊可 | シード + テストユーザー。週次でリセット可 | 実ユーザーデータ。破壊禁止 |
| Auth.js セッション | ローカル専用 AUTH_SECRET | Preview専用 AUTH_SECRET | 本番専用 AUTH_SECRET |
| robots | 対象外 | `noindex`（X-Robots-Tag: noindex を必ず付与） | 正式公開後にインデックス許可 |
| ログ確認 | コンソール | Vercel Logs（Preview） | Vercel Logs（Production） |

- Neonブランチ運用: `main`（本番・親ブランチ）から `develop`（Preview用）と `dev`（ローカル用・任意）を分岐する。マイグレーションは各環境のデプロイ時に `prisma migrate deploy` で適用する（DEC-257、25章 §6.3）。
- PRごとのVercel Preview URLも DB は Neon `develop` ブランチを共有する（PRごとにNeonブランチを切る自動化は将来検討。ISSUE-261）。

### 1.2 環境変数差分表

25_GitHub_Operation.md §8 の分担表と一致させること（アプリ実行時の秘密値はVercel環境変数、CI専用値のみGitHub Secrets）。

| 変数 | local (.env.local) | Vercel Preview | Vercel Production |
|---|---|---|---|
| DATABASE_URL | Docker or Neon `dev`（pooler） | Neon `develop` ブランチの **pooler** 接続文字列 | Neon `main` ブランチの **pooler** 接続文字列 |
| DIRECT_URL | 同上の direct | Neon `develop` の **direct** 接続文字列（migrate用） | Neon `main` の **direct** 接続文字列（migrate用） |
| AUTH_SECRET | ローカル専用値 | Preview専用値（本番と別値） | 本番専用値（`openssl rand -base64 32` で生成） |
| NEXT_PUBLIC_APP_URL | http://localhost:3000 | https://develop-rogue-chronicle.vercel.app | https://rogue-chronicle.vercel.app（独自ドメイン移行後は差し替え） |

補足:

- DATABASE_URL は実行時クエリ用（PgBouncer pooler経由、サーバーレスの同時接続対策）。DIRECT_URL は Prisma migrate 用（pooler非経由）。取り違えると migrate が失敗する（Prisma は pooler 経由の DDL を保証しない）。
- AUTH_SECRET を環境間で共用しない（漏洩時の影響分離・環境間セッション混入防止。25章 §8）。
- Vercel の環境変数は必ず **Environment スコープ（Production / Preview / Development）を分けて登録**する。スコープ設定ミスは「PreviewのマイグレーションがNeon mainに走る」事故に直結する（25章 §6.3 の注意と同一）。

---

## 2. Neon 初回セットアップ手順

1. https://neon.tech でサインアップし、プロジェクト `rogue-chronicle` を作成する（リージョンは Vercel の Functions リージョンに合わせて **AWS ap-northeast-1 (Tokyo)** を選択。仮決定 DEC-261）。PostgreSQL バージョンはデフォルト最新を採用。
2. デフォルトブランチ `main` を本番用とする。データベース名は `rogue_chronicle`（自動作成の `neondb` から変更してよい）。
3. ブランチ戦略を設定する:
   - `main`: 本番。Vercel Production からのみ接続
   - `develop`: `main` から作成。Preview 用。スキーマは main と同一系譜、データはシード+テストデータ
   - `dev`（任意）: `main` から作成。ローカル開発でDockerを使わない場合に使用
4. 各ブランチの接続文字列を2種類控える（Neonダッシュボード > Connection Details）:
   - **pooler**（`-pooler` がホスト名に付く方）→ DATABASE_URL に設定
   - **direct**（poolerなし）→ DIRECT_URL に設定
5. Neon Free プランの PITR（Point-in-Time Restore）保持期間を確認する（Freeは履歴保持が短いため、日次の `pg_dump` を併用する。§4 のバックアップ・リストア訓練参照）。
6. `prisma/schema.prisma` の datasource に `url = env("DATABASE_URL")` / `directUrl = env("DIRECT_URL")` を設定し、ローカルから `pnpm prisma migrate dev` → `pnpm prisma db seed` で初期スキーマとマスタデータ（characters, skills, skill_effects, relics, enemies, dungeons 等）を投入して疎通確認する。

## 3. Vercel 初回セットアップ手順

1. **プロジェクト作成**: https://vercel.com で Hobby プランのアカウントを作成し、「Add New > Project」を選択。
2. **Git連携**: GitHub リポジトリ `rogue-chronicle`（Private可）を Import する。Framework Preset は Next.js が自動検出される。Root Directory はリポジトリ直下。Production Branch を `main` に設定（デフォルトのまま）。
3. **ビルド設定**: Build Command は `package.json` の `build`（`prisma generate && prisma migrate deploy && next build`、DEC-257）をそのまま使用。Install Command は `pnpm install`。Node.js バージョンは LTS を明示。
4. **環境変数**: §1.2 の表どおりに、Production スコープ4変数・Preview スコープ4変数を登録する。登録後に develop へ空コミットを push し、Preview デプロイの成功と `/api/v1/announcements`（API-104・認証不要）の応答でDB疎通を確認する。
5. **developの固定エイリアス**: Settings > Domains で `develop-rogue-chronicle.vercel.app`（ISSUE-251）を `develop` ブランチに割り当てる。
6. **ドメイン**: MVP公開時は `rogue-chronicle.vercel.app` を使用。独自ドメインは §9 参照。
7. **デプロイ通知**: Vercel の GitHub コメント通知はON（PRにPreview URLが自動掲載される）。GitHub Actions からはデプロイしない（25章 §6.2）。

### 3.1 独自ドメイン（将来）

- 候補: `rogue-chronicle.com` / `roguechronicle.jp` 等。正式公開（§7 の第3段階）判定通過後に取得する（仮決定 DEC-262: それまでは vercel.app ドメインで運用しコスト0円を維持）。
- 移行手順: レジストラで取得 → Vercel Settings > Domains に追加 → DNS（A/CNAME）設定 → `NEXT_PUBLIC_APP_URL` と Auth.js の trusted host 設定を更新 → 旧URLからのリダイレクトをVercel側で設定。

---

## 4. リリース判定基準チェックリスト

以下を**全て**満たした場合のみ develop → main のリリースPRを作成してよい。1つでも未達なら延期する。

| # | 判定基準 | 確認方法 |
|---|---|---|
| 1 | 全テストケース green（TC-NNN、21_Test_Design.md の対象範囲） | `pnpm test`（Vitest）+ CI（`ci` required check）が全通過 |
| 2 | E2E主要3フローが Preview 環境で通過 | Playwright: (a) ゲスト開始→ラン開始→戦闘勝利→リザルト、(b) 登録→ログイン→保存→再開、(c) 敗北→ソウルシャード50%獲得→永続強化購入 |
| 3 | Lighthouse Mobile スコア 80 以上 | Preview 環境の SCR-002 / SCR-101 / SCR-302 に対し Lighthouse（Moto G相当・4G）で Performance 80+。LCP 3秒以内（CORE_SPEC §12） |
| 4 | セキュリティチェック通過（22章参照） | セキュリティヘッダ（CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / HSTS）を curl で確認。レート制限（認証系5回/分/IP、その他60回/分/ユーザー）の動作確認。全APIの入力が Zod でサーバー側検証されていることをスキーマ網羅表で確認。戦闘系APIのサーバー権威（DEC-007）と Idempotency-Key + 楽観ロックの動作確認 |
| 5 | 利用規約（SCR-007）・プライバシーポリシー（SCR-008）掲載 | 本文レビュー済み・フッターからの導線あり・登録時同意チェックあり |
| 6 | バックアップ・リストア訓練を1回以上実施 | Neon `main` の `pg_dump` を取得 → 別ブランチ（restore-test）にリストア → users / dungeon_runs の件数一致と1ラン再開ができることを確認。手順を記録に残す |

---

## 5. リリース手順（通常リリース）

### 5.1 手順

1. **リリースPR作成**: develop → main の PR を作成（タイトル例: `release: v0.1.0`）。§4 チェックリストの結果をPR本文に貼る。
2. **CI通過確認**: required check `ci` が green であることを確認し squash merge（25章 DEC-255。リリース内容はタグ+CHANGELOGで追跡、DEC-256）。
3. **自動デプロイ**: main への push で Vercel が Production デプロイ（`prisma migrate deploy` → `next build`）。Vercel ダッシュボードで Ready になるまで監視する。
4. **スモークテスト（5項目・本番URLで手動実施、所要10分）**:
   1. ゲスト開始: SCR-005 → API-005 でゲストアカウント作成、SCR-101 ホーム表示
   2. ラン開始: SCR-204 キャラ選択 → API-303 でラン開始、SCR-301 マップ表示
   3. 戦闘1ターン: 戦闘ノード選択 → SCR-302 で通常攻撃1回（API-402）、ダメージ表示と敵行動を確認
   4. 保存再開: ブラウザを閉じて再アクセス → API-304 でラン再開、同一状態に復帰
   5. リザルト: リタイア（API-306 → API-307）→ SCR-403 でソウルシャード80%獲得を確認
5. **タグ付け**: `git tag v0.x.y && git push origin v0.x.y`。CHANGELOG更新（25章 §9）。
6. 問題があれば §5.2 のロールバックへ。

### 5.2 ロールバック手順

**アプリのロールバック = Vercel Instant Rollback**:

1. Vercel ダッシュボード > Deployments > 直前の正常デプロイを選択 > 「Instant Rollback」実行（数秒で切替、再ビルド不要）。
2. GitHub 側で revert PR（main → main）を作成し、コードの実体もロールバック状態に追従させる（Instant Rollback は配信の切替のみで、次の main push で上書きされるため）。
3. 原因調査は Preview 環境で行い、修正は fix/xxx → develop → main の通常経路で再リリース。

**DBはロールバックしない**（前方修正のみ）。これを成立させるため、**マイグレーション後方互換ルール（3段階、12章と整合、仮決定 DEC-263）**を全マイグレーションに適用する:

| 段階 | リリース | 内容 |
|---|---|---|
| 1. 列追加 | リリースN | 新列を NULL許容 or DEFAULT付き で追加。旧コードは新列を無視して動く |
| 2. コード切替 | リリースN+1 | アプリコードを新列の読み書きに切替。旧列への書き込みを停止（読み取りフォールバックは残す） |
| 3. 列削除 | リリースN+2 | 旧列を削除。データ移行（backfill）完了を確認してから実行 |

- 禁止事項: 1リリース内での「列リネーム」「NOT NULL即付与」「列削除と参照コード削除の同時実施」。リネームは「追加→切替→削除」に分解する。
- run_state（JSONB, DEC-011）は `schemaVersion` を持つため、読み込み時マイグレーション（旧version→新versionへの変換関数）で対応し、DB DDLは不要（15_Save_Data_Design.md と整合）。
- ロールバック後は旧コードが動くため、直近リリースに段階2以降のマイグレーションが含まれていた場合は互換範囲（段階1の列が残っていること）を確認する。

---

## 6. メンテナンスモード手順

### 6.1 開始手順

1. **事前告知**: announcements テーブルにメンテナンス告知を登録（API-104 でホーム・タイトルに表示）。計画メンテは原則24時間前告知。
2. **フラグON**: `maintenance_settings` テーブルの `is_maintenance = true` と `message`, `scheduled_end_at` を更新する（MVPでは管理画面がないため、Neonダッシュボードの SQL Editor または手元の運用スクリプト `scripts/maintenance.ts` で実行。DEC-013と整合）。
3. **挙動**: 全APIはミドルウェア層で maintenance_settings を参照し（キャッシュ60秒）、`503 ERR_MAINTENANCE` を返す。フロントは 503 を受けたら SCR-009（メンテナンス画面）へ遷移し、`scheduled_end_at` と告知メッセージを表示する。
4. **例外**: ヘルスチェック用エンドポイントと announcements 取得（API-104）はメンテ中も応答してよい。

### 6.2 終了手順

1. メンテ作業完了後、Preview環境相当の確認（スモークテスト5項目のうち 1・2・4）を本番で実施。
2. `is_maintenance = false` に更新 → SCR-009 から自動復帰（フロントは60秒ポーリング or 再読込導線）。
3. announcements に完了告知を登録。

### 6.3 アクティブラン強制リタイア補償（ISSUE-004 運用）

DBマイグレーション等で run_state の互換が保てない場合、active なランを強制終了する必要がある。その際の補償手順:

1. メンテ開始後、`dungeon_runs` の `status = 'active'` の件数と対象ユーザーを控える（audit_logs に記録）。
2. 一括更新: `status = 'retired'` とし、リタイア扱い（ソウルシャード80%持ち帰り、CORE_SPEC §5.6）で `player_currencies` へ反映、`currency_transactions` に理由コード `maintenance_force_retire` で記録する。
3. **補償**: 通常リタイア（80%）との差分20%を上乗せし、実質100%（クリアボーナスなし）で付与する（仮決定 DEC-264: 運営都合の強制終了でプレイヤーに不利益を出さない）。
4. announcements で対象ユーザー向けに強制リタイアと補償内容を告知する。
5. 実行は運用スクリプト `scripts/force-retire.ts` で行い、dry-run（対象件数表示のみ）→本実行の2段階とする。

---

## 7. 段階公開計画

| 段階 | 対象 | 期間目安 | 内容 | 次段階への判定基準 |
|---|---|---|---|---|
| α（クローズド） | 自分のみ | 2〜4週間 | Production 相当環境で通しプレイ。Neon mainに実データを貯め始める前の最終検証。robots noindex | §4 チェックリスト全達成 / 自分で10ラン完走しクリティカル不具合0 / スマホ実機（iOS Safari + Android Chrome）で全13主要画面の表示崩れなし |
| β（限定公開） | 知人5〜10名 | 4〜8週間 | URLを個別共有（noindex 維持）。Googleフォーム等のフィードバックフォームを SCR-116（設定）とフッターに設置。週次でフィードバックを Issue 化（25章 §5 のトリアージに乗せる） | β参加者の50%以上が3ラン以上プレイ / クリティカル（進行不能・データ消失）不具合0が2週間継続 / 戦闘バランスの重大破綻（全員が階層3以下で詰む等）の解消 / 平均セッションでAPIエラー率1%未満 |
| 正式公開 | 一般 | — | SNS告知（X等）、noindex解除、README整備（25章 §2.1）。`v1.0.0` タグ | 公開後は §8 の障害対応と 27_Roadmap.md Phase 13 の運用改善へ移行 |

- 各段階で問題が出た場合は次段階へ進まず、前段階に留まって修正する。β→正式の間に §4 のバックアップ・リストア訓練を再実施する。

---

## 8. 障害対応一次切り分け手順書

「サイトが開けない/エラーが出る」報告を受けた際の一次対応（目標: 15分以内に原因の系統を特定）。

1. **自分で再現確認**: 本番URLをスマホ回線とWi-Fiの両方で開く。特定ユーザーのみか全体かを切り分ける。
2. **Vercel status 確認**: https://www.vercel-status.com — プラットフォーム障害なら待つ+告知（手順6へ）。
3. **Neon status 確認**: https://neonstatus.com — DB障害なら同様。Vercel Logs に `ERR_INTERNAL` / Prisma接続エラーが多発していればDB系を疑う。
4. **直近デプロイ確認**: Vercel > Deployments で直近デプロイの時刻と障害発生時刻を突合。デプロイ直後の障害なら **§5.2 Instant Rollback を即実行**（原因調査より復旧優先）。
5. **ロールバックで直らない場合**: Vercel Logs で traceId ベースにエラーを特定（23_Logging_Monitoring.md）。DBマイグレーション起因なら後方互換ルール違反を疑い、必要なら §6 のメンテナンスモードへ移行して修復。
6. **告知**: announcements（表示可能なら）+ SNS で「発生時刻・影響範囲・復旧見込み」を告知。復旧後に完了告知。
7. **事後**: 障害記録（発生〜復旧のタイムライン・原因・再発防止）を Issue に残す。

検知の仕組み: UptimeRobot（無料枠）で本番URLとヘルスチェックAPIを5分間隔監視し、ダウン時にメール通知（23章と整合）。

---

## 9. コスト試算表

### 9.1 開始時（0円構成）

| サービス | プラン | 月額 | 主な無料枠 |
|---|---|---|---|
| Vercel | Hobby | 0円 | 帯域 100GB/月、Function実行 100GB-時/月、ビルド6,000分/月 |
| Neon | Free | 0円 | ストレージ 0.5GB、compute 191時間/月相当（自動サスペンドあり）、ブランチ10個 |
| GitHub | Free | 0円 | Private リポジトリ、Actions 2,000分/月（25章 §1.3） |
| UptimeRobot | Free | 0円 | 50モニタ・5分間隔 |
| **合計** | | **0円** | |

※無料枠の数値は2026年時点の目安。プラン改定があるため四半期ごとに公式ページで再確認する。

### 9.2 有料化を検討する閾値（仮決定 DEC-265）

| 指標 | 警戒ライン（無料枠の目安） | 超過時の対応 |
|---|---|---|
| Neon compute 時間 | 月150時間超（自動サスペンドが効いていない兆候） | クエリ削減・キャッシュ見直し → Neon Launch（$19/月〜）へ |
| Neon ストレージ | 0.4GB 超（枠0.5GBの80%） | battle_logs 30日削除の動作確認・run_state肥大調査 → 有料プランへ |
| Vercel 帯域 | 月80GB 超（枠100GBの80%） | 画像最適化・静的アセット削減 → Vercel Pro（$20/月）へ |
| Vercel Function 実行 | 月80GB-時 超 | API呼び出し回数削減（27章 RISK-013）→ Pro へ |

- Hobby プランは商用利用制限があるため、広告・課金を導入する場合（DEC-016 により当面なし）は Pro 移行が必須になる点に留意。
- 監視方法: Vercel / Neon の Usage ダッシュボードを**週1回**目視確認（Phase 13 で確認をルーティン化）。

---

## 未決事項

| ID | 内容 | 期限目安 |
|---|---|---|
| ISSUE-261 | PRごとに Neon ブランチを自動作成する連携（Neon Vercel Integration）を導入するか。MVPでは develop ブランチ共有で開始 | Phase 13 |
| ISSUE-262 | 独自ドメイン名の決定と取得タイミング（DEC-262 で正式公開後としたが、名称確定 DEC-001 の最終判断に依存） | 正式公開判定時 |
| ISSUE-263 | βフィードバックフォームの実装方式（Googleフォーム外部リンク or アプリ内フォーム）。MVPは外部リンクを想定 | Phase 12 |
| ISSUE-264 | Neon Free の PITR 保持期間が要件（日次バックアップ相当）に不足する場合の pg_dump 自動化（GitHub Actions cron での日次ダンプ保存先） | Phase 12 |
| ISSUE-004 | メンテナンス時のアクティブラン強制リタイア補償の最終仕様（本書 §6.3 は運用案。28_Open_Issues.md と同期） | Phase 12 |

## 実装時の注意点

- Vercel の環境変数はスコープ（Production / Preview）を必ず分けること。取り違えは「本番DBへPreviewのマイグレーションが走る」最悪事故になる（25章 §6.3 と同一の警告。二重に書く価値がある）。
- DATABASE_URL（pooler）と DIRECT_URL（direct）の取り違えに注意。migrate は direct、実行時は pooler。
- Instant Rollback は配信切替のみで git の main は巻き戻らない。ロールバック後は必ず revert PR で実体を追従させないと、次のマージで障害コードが再デプロイされる。
- マイグレーション3段階ルール（§5.2）は「小さく頻繁にリリースする」ことが前提。段階1と段階2を同一リリースに同梱しない。
- メンテナンスフラグの参照はリクエストごとのDBアクセスにしない（60秒キャッシュ）。さもないとメンテ確認自体がDB負荷になる。
- スモークテスト5項目は必ず本番URL・スマホ実機を1台含めて実施する（PCのみで済ませない）。
- 503応答にも `Retry-After` ヘッダとエラー共通形式（errorCode: ERR_MAINTENANCE）を守ること（CORE_SPEC §7）。

## 関連設計書

- CORE_SPEC — 技術スタック（§10）・MVP範囲（§11）・非機能目標（§12）・エラーコード（§7）
- 25_GitHub_Operation.md — ブランチ戦略・CI/CD・Secret管理・タグ運用
- 27_Roadmap.md — フェーズ計画（Phase 12 が本書のリリース実施フェーズ）・リスク管理
- 22_Security_Design.md — セキュリティヘッダ・レート制限・Zod検証の詳細
- 12_Database_Design.md — マイグレーション方針・テーブル定義（maintenance_settings, currency_transactions）
- 15_Save_Data_Design.md — run_state schemaVersion と読み込み時マイグレーション
- 21_Test_Design.md — テストケース（TC-NNN）・E2Eフロー定義
- 23_Logging_Monitoring.md — traceId・UptimeRobot監視
- 28_Open_Issues.md — ISSUE-004 ほか未決事項の一元管理
