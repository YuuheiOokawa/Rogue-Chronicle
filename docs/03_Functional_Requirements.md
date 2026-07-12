# 03. 機能要件一覧 — Rogue Chronicle

## 文書情報

- 文書名: 機能要件一覧
- 目的: システム要件（02）をFN-NNNの機能単位に分解し、画面（SCR-NNN）・API（API-NNN）・テーブルとの対応を定義する。以降の画面設計・API設計・モジュール設計・テスト設計の採番基準とする
- 関連文書: CORE_SPEC、docs/02_System_Requirements.md、docs/04_Non_Functional_Requirements.md、docs/13_API_Design.md

## 記載ルール

- 各機能は以下の項目を必ず記載する: 機能ID / 大分類 / 中分類 / 機能名 / 機能概要 / 利用者 / MVP対象(○×△) / 優先度(高中低) / 前提条件 / 入力 / 処理 / 出力 / 例外 / 関連画面 / 関連API / 関連テーブル
- 利用者の略記: 全=全ロール、ゲ=ゲスト、一=一般ユーザー、運=運営担当者、管=管理者、開=開発者、シ=システム（自動実行）
- 例外はCORE_SPEC §7の主要エラーコードで記載する
- 大分類: 認証(FN-0xx) / ホーム・プレイヤー(FN-1xx) / キャラクター・永続強化(FN-2xx) / ダンジョン(FN-3xx) / 戦闘(FN-4xx) / 報酬・スキル・装備・イベント(FN-5xx) / 図鑑・実績・設定(FN-6xx) / 運用・管理(FN-7xx)

## 機能一覧サマリ（全79機能）

| 大分類 | 機能ID範囲 | 件数 | MVP○ |
|---|---|---|---|
| 認証 | FN-001〜FN-010 | 10 | 9 |
| ホーム・プレイヤー | FN-101〜FN-109 | 9 | 9 |
| キャラクター・永続強化 | FN-201〜FN-206 | 6 | 6 |
| ダンジョン | FN-301〜FN-316 | 16 | 16 |
| 戦闘 | FN-401〜FN-408 | 8 | 8 |
| 報酬・スキル・装備・イベント | FN-501〜FN-509 | 9 | 9 |
| 図鑑・実績・設定 | FN-601〜FN-607 | 7 | 7 |
| 運用・管理 | FN-701〜FN-714 | 14 | 13 |
| 合計 | — | 79 | 77 |

---

## 1. 認証（FN-0xx）

### FN-001 ユーザー登録
- **中分類**: アカウント作成 / **機能名**: ユーザー登録
- **機能概要**: メールアドレスとパスワードで正式アカウントを作成し、初期データ（player_progress、player_currencies、初期キャラ swordsman_rain）を払い出してログイン状態にする
- **利用者**: 未認証者 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 同一メールアドレス未登録であること。利用規約・プライバシーポリシーへの同意チェック済み
- **入力**: email、password（8〜72文字、英数記号）、passwordConfirm、同意フラグ
- **処理**: Zod検証 → メール重複確認 → bcryptでハッシュ化 → users(role=user)・user_profiles・user_settings・player_progress(rank=1)・player_currencies(soul_shards=0)・player_characters(swordsman_rain) をトランザクション作成 → JWTセッションCookie発行
- **出力**: 201 + ユーザー概要（userId, displayName, role）。SCR-101へ遷移
- **例外**: ERR_VALIDATION(400) / メール重複はERR_CONFLICT_VERSIONと区別し ERR_VALIDATION(400, details.email="already_used")（存在推測攻撃緩和のため文言は汎用化） / ERR_RATE_LIMITED(429)
- **関連画面**: SCR-004 / **関連API**: API-001 / **関連テーブル**: users, user_profiles, user_settings, auth_sessions, player_progress, player_currencies, player_characters

### FN-002 ログイン
- **中分類**: 認証 / **機能名**: ログイン
- **機能概要**: メール+パスワードで認証し、JWTセッションCookie（24h/最大30日）を発行する。同一アカウントの既存セッションは失効させる（後勝ち）
- **利用者**: 一・管・運・開 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 登録済みアカウント。アカウントロック中でない
- **入力**: email、password、（任意）ログイン維持フラグ
- **処理**: Zod検証 → 失敗回数確認（5回/15分ロック） → bcrypt照合 → auth_sessionsの旧セッション失効（後勝ち、04章§17） → 新セッション記録 → JWT発行
- **出力**: 200 + ユーザー概要。SCR-101へ遷移
- **例外**: ERR_AUTH_INVALID_CREDENTIALS(401) / ERR_AUTH_LOCKED(423) / ERR_RATE_LIMITED(429、5回/分/IP)
- **関連画面**: SCR-003 / **関連API**: API-002 / **関連テーブル**: users, auth_sessions

### FN-003 ログアウト
- **中分類**: 認証 / **機能名**: ログアウト
- **機能概要**: 現在のセッションを失効させ、Cookieを破棄する
- **利用者**: 全（認証済み） / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済みセッションが存在する
- **入力**: セッションCookieのみ（ボディなし）
- **処理**: auth_sessionsの該当行を失効（revoked_at設定） → Cookie削除
- **出力**: 204。SCR-002（タイトル）へ遷移
- **例外**: ERR_AUTH_UNAUTHORIZED(401)（失効済みでも冪等に204を返してよい）
- **関連画面**: SCR-116 / **関連API**: API-003 / **関連テーブル**: auth_sessions

### FN-004 自分の情報取得（セッション確認）
- **中分類**: 認証 / **機能名**: 自分の情報取得
- **機能概要**: 現在のセッションからユーザーID・ロール・ゲスト有無を返す。アプリ初期化時のセッション有効性確認に使う
- **利用者**: 全（認証済み） / **MVP**: ○ / **優先度**: 高
- **前提条件**: セッションCookieが存在する
- **入力**: なし
- **処理**: JWT検証 → auth_sessions失効確認 → users参照
- **出力**: 200 + { userId, displayName, role, isGuest, createdAt }
- **例外**: ERR_AUTH_UNAUTHORIZED(401) / ERR_AUTH_SESSION_EXPIRED(401)
- **関連画面**: SCR-001, SCR-002 / **関連API**: API-004 / **関連テーブル**: users, auth_sessions

### FN-005 ゲスト開始
- **中分類**: アカウント作成 / **機能名**: ゲスト開始
- **機能概要**: 登録なしでゲストユーザー（users.is_guest=true, role=guest）を作成し即プレイ可能にする。初期データ払い出しはFN-001と同一
- **利用者**: 未認証者 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 利用規約への同意チェック済み
- **入力**: 同意フラグのみ
- **処理**: users(is_guest=true, email=null)作成 → 初期データ払い出し → JWTセッションCookie発行（最大30日）
- **出力**: 201 + ユーザー概要。SCR-101へ遷移し「データ消失リスク」バナー表示
- **例外**: ERR_RATE_LIMITED(429、乱造防止のため5回/分/IP)
- **関連画面**: SCR-005 / **関連API**: API-005 / **関連テーブル**: users, user_profiles, user_settings, auth_sessions, player_progress, player_currencies, player_characters

### FN-006 ゲスト引き継ぎ（正式アカウント昇格）
- **中分類**: アカウント連携 / **機能名**: データ引き継ぎ
- **機能概要**: ゲストユーザーにメール+パスワードを付与し、同一user_idのまま一般ユーザーへ昇格する（データ移行なし・一方向のみ）
- **利用者**: ゲ / **MVP**: ○ / **優先度**: 高
- **前提条件**: ゲストとして認証済み。メール未登録
- **入力**: email、password、passwordConfirm
- **処理**: Zod検証 → メール重複確認 → users更新（email設定、password_hash設定、is_guest=false、role=user） → audit_logsに記録
- **出力**: 200 + 更新後ユーザー概要。バナー解除
- **例外**: ERR_AUTH_UNAUTHORIZED(401) / ERR_FORBIDDEN(403、非ゲストが呼んだ場合) / ERR_VALIDATION(400、メール重複含む)
- **関連画面**: SCR-006 / **関連API**: API-006 / **関連テーブル**: users, audit_logs

### FN-007 パスワード再設定
- **中分類**: 認証 / **機能名**: パスワード再設定
- **機能概要**: メールでトークンを送付し、パスワードを再設定する。メール送信基盤が必要なため将来対応
- **利用者**: 一 / **MVP**: ×（将来） / **優先度**: 中
- **前提条件**: メール送信基盤（Resend等）導入済み
- **入力**: 要求: email / 確定: token、newPassword
- **処理**: password_reset_tokens発行（有効30分・単回） → メール送信 → 確定時にトークン検証・ハッシュ更新・全セッション失効
- **出力**: 要求は常に202（存在推測防止）/ 確定は200
- **例外**: ERR_VALIDATION(400) / ERR_NOT_FOUND(404、無効トークン) / ERR_RATE_LIMITED(429)
- **関連画面**: SCR-003（導線） / **関連API**: API-007 / **関連テーブル**: users, password_reset_tokens, auth_sessions

### FN-008 退会
- **中分類**: アカウント削除 / **機能名**: 退会
- **機能概要**: アカウントを論理削除し全セッションを失効。30日後にFN-711が物理削除する
- **利用者**: 一・管・運・開（ゲストは不可） / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み・非ゲスト。確認ダイアログでパスワード再入力
- **入力**: password（本人確認）
- **処理**: パスワード照合 → users.deleted_at設定（論理削除） → auth_sessions全失効 → audit_logs記録 → 進行中ランはstatus=retiredに強制終了
- **出力**: 204。SCR-002へ遷移
- **例外**: ERR_AUTH_INVALID_CREDENTIALS(401) / ERR_FORBIDDEN(403、ゲスト)
- **関連画面**: SCR-116 / **関連API**: API-008 / **関連テーブル**: users, auth_sessions, dungeon_runs, audit_logs

### FN-009 セッション管理（JWT発行・更新・失効）
- **中分類**: セッション / **機能名**: セッション管理
- **機能概要**: Auth.js JWT戦略でセッションを管理する。アクセストークン24h、スライディング延長で最大30日。auth_sessionsで失効管理（後勝ちログイン・退会時全失効に対応）
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: FN-001/002/005いずれかで発行済み
- **入力**: セッションCookie（httpOnly, Secure, SameSite=Lax）
- **処理**: 各リクエストでJWT検証 → auth_sessionsのsession_id失効確認 → 24h経過時はローテーション再発行（発行から30日で打ち切り）
- **出力**: 認証コンテキスト（userId, role）を後続処理へ供給
- **例外**: ERR_AUTH_SESSION_EXPIRED(401) → クライアントはSCR-002へ誘導
- **関連画面**: 全認証必須画面 / **関連API**: 全認証必須API / **関連テーブル**: auth_sessions

### FN-010 ログイン試行ロック
- **中分類**: 不正対策 / **機能名**: ログイン試行ロック
- **機能概要**: 同一アカウントへのパスワード失敗5回で15分間ロックする（04章§15）。IP単位のレート制限（FN-707）とは独立
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: なし
- **入力**: ログイン失敗イベント（email単位）
- **処理**: users.failed_login_count/locked_untilを更新。5回目失敗でlocked_until=now+15分。成功でリセット
- **出力**: ロック中は ERR_AUTH_LOCKED(423) + details.lockedUntil
- **例外**: —（本機能自体が例外系）
- **関連画面**: SCR-003 / **関連API**: API-002 / **関連テーブル**: users

---

## 2. ホーム・プレイヤー（FN-1xx）

### FN-101 ホーム情報表示
- **中分類**: ホーム / **機能名**: ホーム情報取得・表示
- **機能概要**: ホームに必要な情報（プレイヤー概要・通貨・進行中ランの有無・未読お知らせ件数・解放状況）を1リクエストで集約して返す
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: player_progress・player_currencies・dungeon_runs(status=active)・announcementsを並行取得し集約
- **出力**: 200 + { player, currencies, activeRun: { runId, floor } | null, unreadAnnouncements }
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-101, SCR-103 / **関連API**: API-101 / **関連テーブル**: player_progress, player_currencies, dungeon_runs, announcements

### FN-102 プレイヤープロフィール表示
- **中分類**: プレイヤー / **機能名**: プレイヤー情報取得・表示
- **機能概要**: プレイヤーランク・ランクEXP（expToRank(R)=100×R^1.8、上限50）・累計統計（総ラン数/クリア数/撃破数/プレイ時間）・ユーザーID（問い合わせ用）を表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: player_progress、user_profilesを取得。次ランクまでの必要EXPを計算して付与
- **出力**: 200 + { rank, rankExp, expToNextRank, stats, displayName, userId }
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-102 / **関連API**: API-102 / **関連テーブル**: player_progress, user_profiles

### FN-103 所持通貨表示
- **中分類**: プレイヤー / **機能名**: 所持通貨取得
- **機能概要**: ソウルシャード残高を返す（ゴールドはラン内通貨のためrun_state側で管理）。ヘッダー常時表示用の軽量API
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: player_currencies参照
- **出力**: 200 + { soulShards }
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-101, SCR-104, SCR-106 / **関連API**: API-103 / **関連テーブル**: player_currencies

### FN-104 お知らせ表示
- **中分類**: お知らせ / **機能名**: お知らせ取得・表示
- **機能概要**: 公開中のお知らせを新着順に最大20件表示する。カテゴリ（info/maintenance/update/event）バッジ付き
- **利用者**: 全（未認証含む） / **MVP**: ○ / **優先度**: 中
- **前提条件**: なし（認証不要）
- **入力**: なし（クエリ: category任意）
- **処理**: announcementsからis_published=trueかつ公開期間内を取得。既読管理はLocalStorageの既読ID配列で行う（サーバー保存しない。（仮決定））
- **出力**: 200 + お知らせ配列（id, title, body, category, publishedAt）
- **例外**: —（空配列可）
- **関連画面**: SCR-115, SCR-101 / **関連API**: API-104 / **関連テーブル**: announcements

### FN-105 プレイヤーランク・EXP管理
- **中分類**: プレイヤー / **機能名**: プレイヤーランク管理
- **機能概要**: リザルト確定（FN-314）時にランクEXPを加算し、expToRank(R)=100×R^1.8で必要値を超えたらランクアップ（複数段可、上限50）。ランクアップはSCR-406で演出表示
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: リザルト確定処理内で呼ばれる
- **入力**: 獲得rankExp（run_state.earned.rankExp）
- **処理**: player_progress.rank_expに加算 → ランクアップ判定ループ → 上限50で加算打ち切り
- **出力**: 更新後rank・rankExp・rankedUp配列（API-307応答に含める）
- **例外**: ERR_CONFLICT_VERSION(409、楽観ロック競合時は再試行)
- **関連画面**: SCR-406 / **関連API**: API-307 / **関連テーブル**: player_progress

### FN-106 通貨増減記録
- **中分類**: プレイヤー / **機能名**: 通貨トランザクション記録
- **機能概要**: ソウルシャードの全増減（リザルト獲得/キャラ解放/永続強化/補填）を理由コード・増減量・残高付きで記録する
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 通貨を増減させる各ユースケース内で同一トランザクションで実行
- **入力**: userId, currency=soul_shards, amount(±), reason(run_reward/character_unlock/upgrade_purchase/support_grant等), refId
- **処理**: player_currencies更新とcurrency_transactions挿入を同一DBトランザクションで実行。残高負値はERR_INSUFFICIENT_SHARDSで中断
- **出力**: 記録行（API応答には含めない）
- **例外**: ERR_INSUFFICIENT_SHARDS(422)
- **関連画面**: — / **関連API**: API-203, API-204, API-307 / **関連テーブル**: player_currencies, currency_transactions

### FN-107 利用規約・プライバシーポリシー表示
- **中分類**: 静的情報 / **機能名**: 規約表示
- **機能概要**: 利用規約・プライバシーポリシーを静的ページで表示する。登録・ゲスト開始時に同意チェックの遷移先となる
- **利用者**: 全（未認証含む） / **MVP**: ○ / **優先度**: 中
- **前提条件**: なし
- **入力**: なし
- **処理**: 静的Markdown/MDXをビルド時レンダリング（DB不使用）。改定日を明記
- **出力**: 規約ページ
- **例外**: —
- **関連画面**: SCR-007, SCR-008 / **関連API**: なし / **関連テーブル**: なし

### FN-108 ヘルプ表示
- **中分類**: 静的情報 / **機能名**: ヘルプ表示
- **機能概要**: 遊び方（ランの流れ・戦闘・属性相性・状態異常・永続強化）と問い合わせ導線（メール、記載事項案内）を表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 低
- **前提条件**: なし
- **入力**: なし
- **処理**: 静的コンテンツ表示。属性相性表・状態異常表はCORE_SPEC §5.2/5.3の値を転記
- **出力**: ヘルプページ
- **例外**: —
- **関連画面**: SCR-117 / **関連API**: なし / **関連テーブル**: なし

### FN-109 クレジット表示
- **中分類**: 静的情報 / **機能名**: クレジット表示
- **機能概要**: 開発者・使用素材・OSSライセンス表記を表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 低
- **前提条件**: なし
- **入力**: なし
- **処理**: 静的コンテンツ表示（ライセンス一覧はビルド時に生成）
- **出力**: クレジットページ
- **例外**: —
- **関連画面**: SCR-118 / **関連API**: なし / **関連テーブル**: なし

---

## 3. キャラクター・永続強化（FN-2xx）

### FN-201 キャラクター一覧表示
- **中分類**: キャラクター / **機能名**: キャラクター一覧取得・表示
- **機能概要**: 全キャラクター（MVP3体）を解放済み/未解放の状態・解放条件付きで一覧表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: charactersマスタとplayer_charactersを突合し、unlocked/lockedと解放条件（unlock_condition JSONB: mage_lilia=ソウルシャード300、rogue_gald=実績「累計ラン10回」）を返す
- **出力**: 200 + キャラ配列（code, name, type, element, baseStats, unlocked, unlockCondition）
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-104 / **関連API**: API-201 / **関連テーブル**: characters, player_characters, player_achievements

### FN-202 キャラクター詳細表示
- **中分類**: キャラクター / **機能名**: キャラクター詳細取得・表示
- **機能概要**: キャラ1体の初期ステータス・固有能力（例: swordsman_rain「不屈」）・成長率係数・初期スキル・紹介文を表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み。characterIdが存在する（未解放でも閲覧可、ステータスは表示）
- **入力**: パス: characterId
- **処理**: charactersマスタ + player_characters（解放状態・使用統計）を取得
- **出力**: 200 + キャラ詳細
- **例外**: ERR_NOT_FOUND(404)
- **関連画面**: SCR-105 / **関連API**: API-202 / **関連テーブル**: characters, player_characters

### FN-203 キャラクター解放
- **中分類**: キャラクター / **機能名**: キャラクター解放
- **機能概要**: 解放条件を満たすキャラを解放する。mage_liliaはソウルシャード300消費、rogue_galdは実績達成で無償解放（解放操作自体は明示ボタン）
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 未解放であること。条件充足（残高または実績）
- **入力**: パス: characterId / ヘッダ: Idempotency-Key
- **処理**: 条件検証 → 通貨型条件はFN-106経由でソウルシャード減算 → player_characters挿入 → player_codexへキャラ登録（FN-602） → 同一トランザクション
- **出力**: 200 + { unlocked: true, remainingShards }
- **例外**: ERR_INSUFFICIENT_SHARDS(422) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409) / 解放済みはERR_VALIDATION(400)
- **関連画面**: SCR-104, SCR-105 / **関連API**: API-203 / **関連テーブル**: characters, player_characters, player_currencies, currency_transactions, player_achievements, player_codex

### FN-204 永続強化ツリー表示
- **中分類**: 永続強化 / **機能名**: 永続強化ツリー取得・表示
- **機能概要**: upgrade_nodes（MVP12ノード: 初期HP+5%×3段/初期ATK+3%×3段/初期ゴールド+50×2段/開始時レリック1個/スキルリロール+1回/ソウルシャード獲得+10%×2段）を取得済みレベル・次段コスト付きでツリー表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: upgrade_nodesマスタとplayer_upgradesを突合。前提ノード（parent_node）未取得のノードはロック表示
- **出力**: 200 + ノード配列（code, name, effect, currentLevel, maxLevel, nextCost, locked）
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-106 / **関連API**: API-102（ツリーはAPI-204のGET相当としてAPI-102応答に同梱。（仮決定）） / **関連テーブル**: upgrade_nodes, player_upgrades

### FN-205 永続強化実行
- **中分類**: 永続強化 / **機能名**: 永続強化購入
- **機能概要**: ソウルシャードを消費してupgrade_nodesを1段階購入する。効果総和はステータス+30%以内のバランス制約（CORE_SPEC §5.9）
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 対象ノードが最大レベル未満・前提ノード取得済み・残高が次段コスト以上
- **入力**: ボディ: { nodeCode } / ヘッダ: Idempotency-Key
- **処理**: 条件検証 → FN-106でソウルシャード減算 → player_upgrades のレベル+1（upsert） → 同一トランザクション
- **出力**: 200 + { nodeCode, newLevel, remainingShards }
- **例外**: ERR_INSUFFICIENT_SHARDS(422) / ERR_VALIDATION(400、最大レベル・前提未達) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-106 / **関連API**: API-204 / **関連テーブル**: upgrade_nodes, player_upgrades, player_currencies, currency_transactions

### FN-206 武器一覧（永続解放装備）表示
- **中分類**: 装備 / **機能名**: 永続解放装備一覧表示
- **機能概要**: 永続解放済みの装備（player_equipment、初期装備候補になる武器等）をレア度・ステータス付きで一覧表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: なし（クエリ: slot=weapon/armor/accessory 任意）
- **処理**: equipmentマスタとplayer_equipmentを突合し解放済みを返す。未解放は図鑑（FN-601）側でシルエット表示
- **出力**: 200 + 装備配列（code, name, slot, rarity, stats, unlocked）
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-107 / **関連API**: API-102（同梱）または API-601 / **関連テーブル**: equipment, player_equipment

---

## 4. ダンジョン（FN-3xx）

### FN-301 ダンジョン一覧表示
- **中分類**: 出撃準備 / **機能名**: ダンジョン一覧取得・表示
- **機能概要**: 挑戦可能なダンジョン（MVPはforgotten_ruins「忘却の遺跡」1件）を解放状態・推奨ランク付きで一覧表示する。進行中ランがあれば「再開」導線を出す
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: dungeonsマスタ取得 + dungeon_runs(status=active)確認
- **出力**: 200 + ダンジョン配列 + activeRun情報
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-201 / **関連API**: API-301 / **関連テーブル**: dungeons, dungeon_runs

### FN-302 ダンジョン詳細表示
- **中分類**: 出撃準備 / **機能名**: ダンジョン詳細取得・表示
- **機能概要**: ダンジョンの階層数（10）・難易度（Normalのみ、選択UIはSCR-202に統合: SCR-203は△）・出現敵・報酬傾向・ベストスコアを表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み。dungeonIdが存在
- **入力**: パス: dungeonId
- **処理**: dungeons + dungeon_difficulties + 出現敵（enemies参照、図鑑登録済みのみ実名・他はシルエット） + player_progressの当該ダンジョン統計
- **出力**: 200 + ダンジョン詳細
- **例外**: ERR_NOT_FOUND(404)
- **関連画面**: SCR-202, SCR-203(△統合) / **関連API**: API-302 / **関連テーブル**: dungeons, dungeon_difficulties, enemies, player_codex, player_progress

### FN-303 出撃キャラクター選択
- **中分類**: 出撃準備 / **機能名**: キャラクター選択
- **機能概要**: 解放済みキャラから出撃キャラ1体を選択する（DEC-012: MVPは1キャラ編成）。永続強化適用後の開始ステータスをプレビュー表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 解放済みキャラが1体以上（初期状態でswordsman_rainあり）
- **入力**: 画面上の選択（クライアント状態。確定はFN-305のAPI-303で送信）
- **処理**: API-201の結果から解放済みを表示。開始ステータス = 初期値 × (1 + 永続強化補正)をクライアント表示（確定計算はサーバー）
- **出力**: 選択状態 → SCR-205へ
- **例外**: —（未解放キャラ選択はUI上不可。API側でもERR_VALIDATION(400)で防御）
- **関連画面**: SCR-204 / **関連API**: API-201（表示）, API-303（確定） / **関連テーブル**: characters, player_characters, player_upgrades

### FN-304 初期装備選択
- **中分類**: 出撃準備 / **機能名**: 初期装備選択
- **機能概要**: 永続解放済み装備から初期装備（weapon/armor/accessory各1、なしも可）を選択する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: FN-303でキャラ選択済み
- **入力**: 画面上の選択（確定はAPI-303で送信）
- **処理**: player_equipmentの解放済み装備を表示。装備込みステータスをプレビュー
- **出力**: 選択状態 → SCR-207（出撃確認）へ
- **例外**: —（未解放装備はAPI-303側でERR_VALIDATION(400)）
- **関連画面**: SCR-205, SCR-207 / **関連API**: API-303（確定） / **関連テーブル**: equipment, player_equipment

### FN-305 ダンジョン開始（ラン生成）
- **中分類**: ラン管理 / **機能名**: ダンジョン開始
- **機能概要**: 出撃確認からランを開始する。サーバーが32bitシード生成（DEC-019）→ノードマップ生成（10階層、生成制御ルール準拠）→run_state初期化を行い、dungeon_runs(status=active)を作成する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 進行中ランが存在しないこと。選択キャラ解放済み・選択装備解放済み
- **入力**: ボディ: { dungeonCode, difficulty: "normal", characterCode, equipment: { weapon?, armor?, accessory? } } / ヘッダ: Idempotency-Key
- **処理**: 検証 → generateDungeonSeed → generateDungeonMap（階層5/9にREST必須・SHOP1〜2・ELITE階層3以降・同一タイプ3連続禁止・SECRET10%） → 永続強化適用済み開始ステータス計算 → run_state構築（schemaVersion=1, position.floor=1） → dungeon_runs作成
- **出力**: 201 + { runId, runState（クライアント表示用ビュー）}。SCR-301へ遷移
- **例外**: ERR_RUN_ALREADY_ACTIVE(409) / ERR_VALIDATION(400) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-207, SCR-301 / **関連API**: API-303 / **関連テーブル**: dungeon_runs, dungeons, characters, player_upgrades, player_equipment

### FN-306 現在ラン取得・再開
- **中分類**: ラン管理 / **機能名**: 現在ラン取得（再開兼用）
- **機能概要**: 進行中ランのrun_stateを取得し、中断地点（position.phase: map_select/node_action/battle/reward_pending）から再開する。セーブデータ取得（API-604）はこれと統合可
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: dungeon_runs(status=active)を取得。validateRunStateで整合性検証。破損時はdungeon_run_snapshots（直近3世代）から最新の正常世代へ復元
- **出力**: 200 + { runId, version, runState } / 進行中なしは200 + null（404ではない。（仮決定））
- **例外**: ERR_RUN_STATE_INVALID(409、全世代破損時。運営対応)
- **関連画面**: SCR-301, SCR-302（phase復元） / **関連API**: API-304, API-604 / **関連テーブル**: dungeon_runs, dungeon_run_snapshots

### FN-307 次ノード選択
- **中分類**: マップ進行 / **機能名**: 次ノード選択
- **機能概要**: 現在ノードから接続された次階層のノードを選択して進む。戦闘系ノード（BATTLE/STRONG/ELITE/BOSS）ではサーバーが戦闘状態を生成して返す（戦闘開始APIは独立させない: CORE_SPEC §7補足）
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: position.phase=map_select。選択ノードが現在ノードからedgesで接続されている
- **入力**: ボディ: { nodeId, version } / ヘッダ: Idempotency-Key
- **処理**: 接続検証 → ノードタイプ別に分岐（BATTLE系: startBattleで敵編成生成しphase=battle / TREASURE・SHOP・REST・EVENT系: phase=node_actionでノード内容生成 / STORY: テキスト返却）→ run_state更新 + version+1 → スナップショット保存（FN-313）
- **出力**: 200 + 更新後runStateビュー（戦闘ノードならbattle初期状態を含む）
- **例外**: ERR_CONFLICT_VERSION(409) / ERR_INVALID_ACTION(422、未接続ノード・phase不一致) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-301, SCR-302, SCR-305〜308 / **関連API**: API-305 / **関連テーブル**: dungeon_runs, dungeon_run_snapshots, enemies, enemy_actions

### FN-308 休憩実行
- **中分類**: ノード行動 / **機能名**: 休憩実行
- **機能概要**: RESTノードで「HP50%回復」または「スキル1つ強化（強化Lv+1、最大3）」の二択を実行する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 現在ノードがREST・phase=node_action・未実行
- **入力**: ボディ: { choice: "heal" | "upgrade_skill", skillCode?, version } / ヘッダ: Idempotency-Key
- **処理**: 検証 → heal: hp=min(maxHp, hp+floor(maxHp×0.5)) / upgrade_skill: 対象スキルlevel+1（最大3、上限時ERR_INVALID_ACTION） → phase=map_selectへ → version+1
- **出力**: 200 + 更新後runStateビュー
- **例外**: ERR_INVALID_ACTION(422) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-307 / **関連API**: API-505 / **関連テーブル**: dungeon_runs

### FN-309 ランダムイベント選択
- **中分類**: ノード行動 / **機能名**: イベント選択実行
- **機能概要**: EVENT/BLESS/HEAL/CURSE/SECRETノードでrandom_events（MVP10種）の選択肢を実行し、結果（ゴールド増減・HP増減・レリック・スキル・呪い等）を適用する。SECRETはEVENT扱いの上位報酬
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 現在ノードがイベント系・phase=node_action・未選択
- **入力**: ボディ: { choiceId, version } / ヘッダ: Idempotency-Key
- **処理**: random_event_choicesの効果（effect JSONB）をサーバーで抽選・適用（PRNGはrun_stateのrngCursorを進める） → 結果テキストと変化量を返す → phase=map_select
- **出力**: 200 + { resultText, effects[], runState }
- **例外**: ERR_INVALID_ACTION(422) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-308 / **関連API**: API-506 / **関連テーブル**: dungeon_runs, random_events, random_event_choices

### FN-310 宝箱開封
- **中分類**: ノード行動 / **機能名**: 宝箱開封
- **機能概要**: TREASUREノードで宝箱を開封し、reward_tablesに基づきサーバー抽選した報酬（ゴールド/装備/レリック/回復アイテム）を付与する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 現在ノードがTREASURE・phase=node_action・未開封
- **入力**: ボディ: { version } / ヘッダ: Idempotency-Key
- **処理**: generateTreasureReward（reward_tables + rngCursor） → 装備ドロップ時はpendingRewardに格納し装備選択（FN-504）へ、それ以外は即時適用 → phase遷移
- **出力**: 200 + { rewards[], runState }
- **例外**: ERR_REWARD_ALREADY_CLAIMED(409) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-305, SCR-309 / **関連API**: API-503 / **関連テーブル**: dungeon_runs, reward_tables, equipment, relics

### FN-311 ショップ購入（ダンジョン内）
- **中分類**: ノード行動 / **機能名**: ショップ購入
- **機能概要**: SHOPノードで、ラン開始時シードから生成された品揃え（装備・回復アイテム・スキル削除サービス）をゴールドで購入する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 現在ノードがSHOP・phase=node_action。対象商品が未売却
- **入力**: ボディ: { itemIndex, version } / ヘッダ: Idempotency-Key
- **処理**: generateShopItemsの結果（run_stateに保存済み）と照合 → purchaseShopItem: ゴールド減算・効果適用・売り切れフラグ → 複数購入可、退店はクライアント操作でphase=map_selectへ（退店もAPI-504のaction=leaveで確定。（仮決定））
- **出力**: 200 + { purchased, gold, runState }
- **例外**: ERR_INSUFFICIENT_GOLD(422) / ERR_INVALID_ACTION(422、売り切れ) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-306 / **関連API**: API-504 / **関連テーブル**: dungeon_runs, equipment, skills
- **補足**: ノードタイプSHOPの出現はマップ全体で1〜2個（CORE_SPEC §5.6）

### FN-312 リタイア
- **中分類**: ラン管理 / **機能名**: リタイア
- **機能概要**: 進行中ランを任意に放棄する。敗北扱いだが獲得ソウルシャードは80%持ち帰り（敗北50%/クリア100%）。確認画面で持ち帰り予定額を提示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 進行中ランあり。戦闘中でも可（（仮決定）: 戦闘中リタイアは逃走と別で、その場でラン終了）
- **入力**: ボディ: { version } / ヘッダ: Idempotency-Key
- **処理**: retireDungeon → status=retired → earned.soulShards×0.8で確定額計算 → phase=reward_pending（受領はFN-314）
- **出力**: 200 + { finalRewards（予定額）, runState }。SCR-403へ
- **例外**: ERR_CONFLICT_VERSION(409) / ERR_RUN_STATE_INVALID(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-313, SCR-314, SCR-403 / **関連API**: API-306 / **関連テーブル**: dungeon_runs

### FN-313 ラン途中保存・スナップショット管理
- **中分類**: ラン管理 / **機能名**: 途中保存・チェックポイント
- **機能概要**: ラン系変更APIの成功ごとにrun_stateを保存し、ノード確定時点でdungeon_run_snapshotsにチェックポイントを直近3世代で世代管理する（破損時のFN-306復元用）
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 進行中ランあり
- **入力**: 更新後run_state
- **処理**: saveRunProgress: dungeon_runs.run_state更新+version+1（楽観ロック）。ノード完了時（phase=map_selectへ戻る時）にスナップショット挿入・4世代目以降を削除
- **出力**: 保存済みversion
- **例外**: ERR_CONFLICT_VERSION(409)
- **関連画面**: —（全ラン中画面の裏で動作） / **関連API**: API-303, 305, 306, 402, 502〜508 / **関連テーブル**: dungeon_runs, dungeon_run_snapshots

### FN-314 リザルト確定（報酬受領）
- **中分類**: ラン管理 / **機能名**: リザルト確定
- **機能概要**: クリア/敗北/リタイア後のランを確定し、永続報酬（ソウルシャード=クリア100%+クリアボーナス/リタイア80%/敗北50%、ランクEXP、図鑑、実績判定、新規解放）を付与してstatus=finalizedにする
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: status ∈ {cleared, failed, retired} かつ未確定
- **入力**: ボディ: { version } / ヘッダ: Idempotency-Key
- **処理**: grantPersistentRewards: 係数適用（永続強化「ソウルシャード獲得+10%」含む）→ FN-106で加算 → FN-105ランクEXP → FN-602図鑑一括登録 → FN-604実績判定 → status=finalized → 全て同一トランザクション
- **出力**: 200 + { rewards, rankUp?, unlocked[], achievements[] }。SCR-403→SCR-404〜407
- **例外**: ERR_REWARD_ALREADY_CLAIMED(409、確定済み) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-401〜407 / **関連API**: API-307 / **関連テーブル**: dungeon_runs, player_currencies, currency_transactions, player_progress, player_codex, player_achievements, player_equipment

### FN-315 ステータス確認（ラン中）
- **中分類**: ラン中情報 / **機能名**: ステータス確認
- **機能概要**: ラン中いつでも現在のキャラステータス（HP/SP/atk/def/spd/critRate/critDmg/eva/acc/statusRes/elemRes）・レベル・EXP・バフデバフ・レリック効果込み実効値を確認できる
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 進行中ランあり
- **入力**: なし（API-304の応答から表示。追加APIなし）
- **処理**: クライアントがrunStateビューの実効ステータス（サーバー計算済み）を表示
- **出力**: ステータスモーダル表示
- **例外**: —
- **関連画面**: SCR-311 / **関連API**: API-304 / **関連テーブル**: dungeon_runs

### FN-316 所持品確認（ラン中）
- **中分類**: ラン中情報 / **機能名**: 所持品確認
- **機能概要**: ラン中の所持スキル（最大8枠、強化Lv付き）・装備3枠・レリック・アイテム・ゴールドを一覧確認できる
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 進行中ランあり
- **入力**: なし（API-304の応答から表示）
- **処理**: runStateビューのskills/equipment/relics/items/goldを表示
- **出力**: 所持品モーダル表示
- **例外**: —
- **関連画面**: SCR-312 / **関連API**: API-304 / **関連テーブル**: dungeon_runs

---

## 5. 戦闘（FN-4xx）

### FN-401 戦闘状態取得
- **中分類**: 戦闘進行 / **機能名**: 戦闘状態取得
- **機能概要**: 進行中戦闘の状態（敵一覧・HP・行動予告(intent)・ターン数・行動順・バフデバフ・状態異常・自キャラHP/SP）を取得する。リロード復帰用
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: position.phase=battle
- **入力**: なし
- **処理**: run_state.battleからクライアント表示用ビューを生成（敵の内部AI重みや将来行動は含めない）
- **出力**: 200 + battleビュー
- **例外**: ERR_RUN_STATE_INVALID(409、戦闘中でない)
- **関連画面**: SCR-302 / **関連API**: API-401 / **関連テーブル**: dungeon_runs

### FN-402 戦闘開始処理
- **中分類**: 戦闘進行 / **機能名**: 戦闘開始（サーバー生成）
- **機能概要**: 戦闘系ノード進入時（FN-307内）に敵編成（1〜3体）を生成する。敵ステータスはstat(floor)=base×(1+0.12×(floor-1))×difficultyMod、種別補正（強敵HP×1.5,ATK×1.15/エリートHP×2.0,ATK×1.3/ボスHP×4.0,ATK×1.5）を適用。行動順はspd降順（同値はプレイヤー優先）
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: FN-307で戦闘系ノードが選択された
- **入力**: ノードタイプ・floor・rngCursor
- **処理**: startBattle: 敵編成抽選（dungeonsのgeneration_config + reward_tables参照） → determineTurnOrder → 各敵の初回intent決定（FN-404） → run_state.battle構築（enemies, turnNo=1, actionQueue, rngCursor, effects）
- **出力**: battle初期状態（FN-307の応答に同梱）
- **例外**: —（FN-307の例外に含まれる）
- **関連画面**: SCR-302 / **関連API**: API-305 / **関連テーブル**: dungeon_runs, enemies, enemy_actions, enemy_ai_rules

### FN-403 行動実行
- **中分類**: 戦闘進行 / **機能名**: プレイヤー行動実行
- **機能概要**: 攻撃/スキル/防御/アイテム/逃走のいずれかを実行し、そのターンの全処理（プレイヤー行動→敵行動→ターン終了処理）をサーバーで解決して結果を返す（DEC-007）
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: phase=battle。SP不足のスキルは選択不可。逃走はボス・エリート戦不可
- **入力**: ボディ: { action: "attack"|"skill"|"guard"|"item"|"flee", skillCode?, itemCode?, targetIndex?, version } / ヘッダ: Idempotency-Key
- **処理**: executePlayerAction（FN-405/406で計算）→ 敵死亡判定 → executeEnemyAction（各敵、FN-404の選択済みintent実行）→ ターン終了処理（毒/火傷ダメージ、regen、継続ターン減算、SP+2回復、次intent決定）→ checkBattleEnd → 勝利時はFN-407、敗北時はfailDungeon
- **出力**: 200 + { turnResult（行動ログ配列: 行動者/対象/ダメージ/回避/クリ/状態異常）, battleEnd?: { result, rewards, expGained, levelUps }, runState }
- **例外**: ERR_INVALID_ACTION(422、SP不足・逃走不可・対象不正) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-302 / **関連API**: API-402 / **関連テーブル**: dungeon_runs, battle_logs, skills, skill_effects

### FN-404 敵AI行動選択・行動予告
- **中分類**: 敵AI / **機能名**: 敵行動選択と予告表示
- **機能概要**: 「重み付き行動テーブル(enemy_actions)+条件ルール(enemy_ai_rules、優先評価)」で敵の次行動を決定し、全敵のintentをターン開始時にプレイヤーへ表示する。完全ランダム禁止
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 戦闘中
- **入力**: 敵状態（HP割合・ターン数・味方状況）・rngCursor
- **処理**: selectEnemyAction: enemy_ai_rulesを優先度順に評価（例: ruin_guardianはHP50%以下で怒り atk+30%、orc_championは2ターンごと強撃）→ 該当なしはenemy_actionsの重み抽選 → intentとしてbattleビューに含める
- **出力**: 各敵のintent（actionCode, 表示名, 種別アイコン: 攻撃/強攻撃/バフ/デバフ/回復/召喚）
- **例外**: —
- **関連画面**: SCR-302 / **関連API**: API-401, API-402 / **関連テーブル**: enemies, enemy_actions, enemy_ai_rules

### FN-405 ダメージ・命中・クリティカル計算
- **中分類**: 戦闘計算 / **機能名**: ダメージ計算（サーバー権威）
- **機能概要**: CORE_SPEC §5.4の式で計算する。ダメージ=max(1, floor(atk×skillMult×(100/(100+def))×elemMod×critMod×rand(0.90〜1.10)))。命中=rand100<clamp(95+acc-eva,50,100)。クリ=rand100<critRate。属性相性は火→風/風→水/水→火が1.25、逆が0.75、無は等倍。逃走成功率=clamp(50+(自spd-敵最速spd)×2,20,90)
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 乱数はシード付きPRNG（mulberry32相当、DEC-019）でrngCursorを消費
- **入力**: 攻撃側/防御側の実効ステータス、skillMult（通常1.0/スキル0.8〜3.0）、属性
- **処理**: calculateEvasion → calculateCritical → calculateDamage（elemResで属性ダメージ最大-50%）→ HP反映
- **出力**: ダメージ値・回避/クリフラグ（turnResultに格納）
- **例外**: —
- **関連画面**: SCR-302 / **関連API**: API-402 / **関連テーブル**: dungeon_runs（rngCursor）

### FN-406 状態異常・バフデバフ処理
- **中分類**: 戦闘計算 / **機能名**: 状態異常・バフデバフ管理
- **機能概要**: MVP5種の状態異常（poison: 毎ターンmaxHp8%/3T、burn: maxHp5%+atk-10%/2T、paralysis: 30%行動不能/2T、stun: 1回行動不能/1T、weaken: def-25%/3T）とバフデバフ（atkUp/Down, defUp/Down, spdUp/Down, critUp, regen: maxHp5%回復）を管理する。成功率=基本成功率×(100-statusRes)/100。バフデバフの重複は同種上書き・効果値大優先
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 戦闘中
- **入力**: 付与効果（skill_effects / enemy_actionsのparams JSONB）
- **処理**: applyStatusEffect/applyBuff/applyDebuff → ターン終了時にダメージ・回復適用と残ターン減算 → 行動前に麻痺/スタン判定
- **出力**: 効果適用結果（turnResultに格納）、battleビューのeffects
- **例外**: —
- **関連画面**: SCR-302 / **関連API**: API-402 / **関連テーブル**: dungeon_runs, skill_effects

### FN-407 戦闘終了判定・戦闘報酬計算
- **中分類**: 戦闘計算 / **機能名**: 戦闘終了・報酬計算
- **機能概要**: 全敵撃破で勝利（ゴールド・EXP=Σ baseExp×(1+0.10×(floor-1))×difficultyExpMod・ドロップ抽選・ソウルシャード積算をサーバー計算しAPI-402応答に含める）。自HP0で敗北（swordsman_rainの「不屈」はラン中1回HP1で耐える）。ボス撃破（階層10）はクリア確定
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 各行動解決後に判定
- **入力**: 戦闘状態
- **処理**: checkBattleEnd → 勝利: calculateBattleReward（reward_tables）+ gainExperience（レベルアップ時はlevelUp: maxHp+8%,atk+5%,def+5%,spd+2%×成長率係数0.8〜1.2、HP割合維持、スキル3択はFN-501へ）→ 敗北: failDungeon(status=failed) → 逃走成功: 報酬なしでphase=map_select
- **出力**: battleEnd（result, rewards, expGained, levelUps, pendingSkillChoice）
- **例外**: —
- **関連画面**: SCR-302, SCR-303, SCR-402 / **関連API**: API-402 / **関連テーブル**: dungeon_runs, reward_tables, enemies
- **補足**: ラン内レベル上限20・開始Lv1・必要EXP expToNext(L)=floor(20×L^1.5)

### FN-408 戦闘ログ記録
- **中分類**: ログ / **機能名**: 戦闘ログ記録
- **機能概要**: 戦闘ごとの全ターン結果（行動・乱数カーソル・ダメージ）をbattle_logsに記録する。チート検証・不具合調査・再現性確認（シード+カーソルでリプレイ可能: DEC-019）に使用。保持30日
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: 戦闘終了時（勝利/敗北/逃走）
- **入力**: run_id, floor, nodeId, 敵編成, ターンログ(JSONB), seed, 開始/終了rngCursor, 結果
- **処理**: 戦闘終了トランザクション内で1行挿入（ターン詳細はJSONB集約）
- **出力**: ログ行（ユーザーには非公開）
- **例外**: 挿入失敗は戦闘結果を巻き戻さずWARNログのみ（（仮決定）: ログは結果整合で許容）
- **関連画面**: — / **関連API**: API-402 / **関連テーブル**: battle_logs

---

## 6. 報酬・スキル・装備・イベント（FN-5xx）

### FN-501 レベルアップ候補取得（スキル3択）
- **中分類**: スキル / **機能名**: スキル3択候補取得
- **機能概要**: レベルアップ時にスキル候補3件（レア度重み: common60/rare30/epic10）をサーバー抽選して提示する。所持済みスキルが候補に出た場合は「強化Lv+1」として表示
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: 未消化のレベルアップがある（pendingReward.type=skill_choice）
- **入力**: なし
- **処理**: generateSkillChoices（rngCursor消費、キャラ適性・所持状況考慮）。候補はrun_stateに保存済みのものを返す（リロードで変わらない）
- **出力**: 200 + { choices[3]: { code, name, rarity, description, isUpgrade }, rerollsLeft, canSkip }
- **例外**: ERR_NOT_FOUND(404、pendingなし)
- **関連画面**: SCR-303, SCR-304 / **関連API**: API-501 / **関連テーブル**: dungeon_runs, skills, skill_effects

### FN-502 スキル選択・リロール・スキップ
- **中分類**: スキル / **機能名**: スキル選択実行
- **機能概要**: 3択から1つ選択、またはリロール（1回/ラン、永続強化「スキルリロール+1回」で追加）、またはスキップ（獲得なし）を実行する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: pendingReward.type=skill_choice。リロールは残回数>0
- **入力**: ボディ: { action: "select"|"reroll"|"skip", choiceIndex?, version } / ヘッダ: Idempotency-Key
- **処理**: select: selectSkill（新規は8枠上限確認、上限時は入替UI要求 / 所持済みはFN-503で強化）/ reroll: 候補再抽選・残回数-1 / skip: pending解消 → 複数レベルアップ時は次のpendingへ
- **出力**: 200 + { acquired?, nextChoice?, runState }
- **例外**: ERR_INVALID_ACTION(422、リロール残0・枠上限で入替未指定) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-303 / **関連API**: API-502 / **関連テーブル**: dungeon_runs, skills

### FN-503 スキル強化
- **中分類**: スキル / **機能名**: スキル強化
- **機能概要**: 同一スキル再取得（3択・休憩）で強化Lv+1（最大3）。倍率・効果値が上昇する（強化値はskillsマスタのlevel_scaling JSONBで定義）
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 対象スキル所持済み・強化Lv<3
- **入力**: skillCode（FN-502/FN-308から）
- **処理**: run_state.skills[].level+1。Lv3のスキルは3択候補から除外（FN-501側で制御）
- **出力**: 強化後スキル情報
- **例外**: ERR_INVALID_ACTION(422、Lv3超過)
- **関連画面**: SCR-303, SCR-307 / **関連API**: API-502, API-505 / **関連テーブル**: dungeon_runs, skills

### FN-504 装備変更（ラン内）
- **中分類**: 装備 / **機能名**: ラン内装備変更
- **機能概要**: ドロップ・購入で得た装備を weapon/armor/accessory 各1枠に装備/交換する。交換で外した装備は破棄（MVPはラン内に装備の予備インベントリを持たない。（仮決定））
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: pendingRewardに装備があるか、所持品画面から変更操作
- **入力**: ボディ: { equipCode, slot, action: "equip"|"discard", version } / ヘッダ: Idempotency-Key
- **処理**: 検証 → run_state.equipment更新 → 実効ステータス再計算 → 図鑑登録（FN-602はリザルト時一括）
- **出力**: 200 + { equipment, stats, runState }
- **例外**: ERR_INVALID_ACTION(422、slot不一致) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-309, SCR-312 / **関連API**: API-507 / **関連テーブル**: dungeon_runs, equipment

### FN-505 レリック取得確定
- **中分類**: レリック / **機能名**: レリック取得
- **機能概要**: 宝箱・イベント・エリート報酬で提示されたレリックの取得を確定する。同一レリック重複不可（重複時は代替報酬ゴールド。（仮決定））。呪い付き2種は効果とデメリットを明示して確認
- **利用者**: 全 / **MVP**: ○ / **優先度**: 高
- **前提条件**: pendingReward.type=relic
- **入力**: ボディ: { accept: true|false, version } / ヘッダ: Idempotency-Key
- **処理**: accept: run_state.relicsへ追加、trigger(always/battle_start/turn_start/turn_end/on_low_hp/on_kill/node_enter)+effect JSONBを以後の計算に組み込み / 拒否: pending解消のみ
- **出力**: 200 + { relics, runState }
- **例外**: ERR_REWARD_ALREADY_CLAIMED(409) / ERR_CONFLICT_VERSION(409) / ERR_DUPLICATE_REQUEST(409)
- **関連画面**: SCR-310 / **関連API**: API-508 / **関連テーブル**: dungeon_runs, relics

### FN-506 経験値・レベルアップ処理
- **中分類**: 成長 / **機能名**: ラン内レベルアップ
- **機能概要**: 戦闘勝利EXPでラン内レベル（上限20）を上げる。成長: maxHp+8%,atk+5%,def+5%,spd+2%（キャラ成長率係数0.8〜1.2乗算）。全回復なし（HP割合維持）。レベルアップごとにスキル3択（FN-501）を積む
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: FN-407で勝利しEXP獲得
- **入力**: expGained
- **処理**: gainExperience → expToNext(L)=floor(20×L^1.5)で判定 → levelUp（複数段可、各段でpendingSkillChoice追加）
- **出力**: levelUps配列（newLevel, statGains）（API-402応答に含む）
- **例外**: —（上限20到達後はEXP破棄）
- **関連画面**: SCR-304 / **関連API**: API-402 / **関連テーブル**: dungeon_runs, characters

### FN-507 報酬抽選（ドロップ・宝箱・イベント共通）
- **中分類**: 報酬 / **機能名**: 報酬抽選エンジン
- **機能概要**: reward_tables（テーブルcode+重み付きエントリ+レア度: common/rare/epic）に基づく共通抽選機構。戦闘ドロップ・宝箱・SECRET上位報酬・イベント報酬で共用する。MVPの装備オプションは固定値のみ
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: 呼び出し元コンテキスト（floor, nodeType, enemyType）
- **入力**: rewardTableCode, rngCursor
- **処理**: テーブル解決 → 重み抽選（PRNG） → 報酬インスタンス生成（gold量はfloor係数適用）
- **出力**: rewards配列（type: gold/equipment/relic/item, code, amount）
- **例外**: ERR_INTERNAL(500、テーブル未定義=マスタ不整合)
- **関連画面**: SCR-305, SCR-302, SCR-308 / **関連API**: API-402, 503, 506 / **関連テーブル**: reward_tables, equipment, relics

### FN-508 永続報酬付与
- **中分類**: 報酬 / **機能名**: 永続報酬付与
- **機能概要**: リザルト確定時にrun_state.earnedから永続報酬を付与する。ソウルシャード（クリア100%+クリアボーナス/リタイア80%/敗北50%、永続強化+10%系適用）、ランクEXP、初クリア系の装備解放
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: FN-314のトランザクション内
- **入力**: run_state.earned { soulShards, rankExp, kills }, run status
- **処理**: grantPersistentRewards: 係数計算 → FN-106通貨加算 → FN-105ランクEXP → player_equipmentへの解放（該当時）→ player_progress統計更新（総ラン数・クリア数・撃破数）
- **出力**: 確定報酬明細（API-307応答）
- **例外**: ERR_CONFLICT_VERSION(409)
- **関連画面**: SCR-403, SCR-404 / **関連API**: API-307 / **関連テーブル**: player_currencies, currency_transactions, player_progress, player_equipment

### FN-509 新規解放通知
- **中分類**: 報酬 / **機能名**: 新規解放演出
- **機能概要**: リザルト確定で発生した新規解放（キャラ解放条件充足・装備解放・図鑑新規登録・実績解除）をSCR-405/SCR-407（トースト）で通知する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: API-307応答にunlocked/achievementsが含まれる
- **入力**: API-307応答
- **処理**: クライアントが解放種別ごとに演出（Framer Motion、DEC-009）。既読管理不要（その場限りの演出）
- **出力**: 演出表示 → SCR-101へ
- **例外**: —
- **関連画面**: SCR-405, SCR-406, SCR-407 / **関連API**: API-307 / **関連テーブル**: —

---

## 7. 図鑑・実績・設定（FN-6xx）

### FN-601 図鑑表示
- **中分類**: 図鑑 / **機能名**: 図鑑取得・表示
- **機能概要**: player_codex（entry_typeで スキル/レリック/敵/装備/キャラ を統合: DEC-018）を種別タブで表示する。未登録はシルエット+「???」。収集率（登録数/総数）を種別ごとに表示
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: クエリ: entryType（skill/relic/enemy/equipment/character、省略時全件）
- **処理**: 各マスタの総リストとplayer_codexを突合。登録済みは詳細（敵は弱点属性・使用技も）を返す
- **出力**: 200 + { entries[], collectionRate }
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-108, SCR-109, SCR-110 / **関連API**: API-601 / **関連テーブル**: player_codex, skills, relics, enemies, equipment, characters

### FN-602 図鑑自動登録
- **中分類**: 図鑑 / **機能名**: 図鑑登録
- **機能概要**: 初遭遇（敵）・初取得（スキル/レリック/装備）・初解放（キャラ）をplayer_codexへ登録する。ラン中の遭遇・取得はrun_state.earnedに蓄積し、リザルト確定時に一括登録（敗北ランでも登録される）
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: FN-314のトランザクション内（キャラ解放はFN-203内）
- **入力**: 登録候補（entry_type + code）の配列
- **処理**: 既登録を除外しplayer_codexへ一括upsert（初回登録日時を記録）
- **出力**: 新規登録配列（FN-509の演出用）
- **例外**: —（重複はupsertで無害）
- **関連画面**: SCR-405 / **関連API**: API-307, API-203 / **関連テーブル**: player_codex

### FN-603 実績一覧表示
- **中分類**: 実績 / **機能名**: 実績取得・表示
- **機能概要**: 実績（MVP10個、例: 累計ラン10回=rogue_gald解放条件）を達成/未達成・進捗値（例: 7/10）・達成日時付きで一覧表示する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: achievementsマスタとplayer_achievementsを突合。進捗型はplayer_progress統計から現在値を算出
- **出力**: 200 + 実績配列（code, name, description, achieved, progress, achievedAt）
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-111 / **関連API**: API-106 / **関連テーブル**: achievements, player_achievements, player_progress

### FN-604 実績判定・解除
- **中分類**: 実績 / **機能名**: 実績判定
- **機能概要**: リザルト確定時に実績条件（condition JSONB: 統計閾値型/イベント型）を評価し、新規達成をplayer_achievementsに記録する。キャラ解放条件に連動（rogue_gald）
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: FN-314のトランザクション内
- **入力**: 更新後player_progress統計 + 当該ランの実績イベント（例: ノーダメージクリア）
- **処理**: 未達成実績のみ条件評価 → 達成分を挿入 → 解放条件連動の再評価（FN-201の表示に反映）
- **出力**: 新規達成配列（API-307応答、SCR-407トースト）
- **例外**: —
- **関連画面**: SCR-407 / **関連API**: API-307 / **関連テーブル**: achievements, player_achievements, player_progress

### FN-605 設定取得
- **中分類**: 設定 / **機能名**: 設定取得
- **機能概要**: ユーザー設定（効果音音量、演出速度: 通常/高速、ダメージ表示、色覚サポートモード、文字サイズ）を取得する
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: user_settings参照（未設定項目はデフォルト値で補完）
- **出力**: 200 + 設定オブジェクト
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-116 / **関連API**: API-602 / **関連テーブル**: user_settings

### FN-606 設定更新
- **中分類**: 設定 / **機能名**: 設定更新
- **機能概要**: 設定値を更新する。表示名（user_profiles.display_name、1〜16文字）変更も本機能に含める
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: ボディ: 設定オブジェクト（部分更新可）
- **処理**: Zod検証（列挙値・範囲） → user_settings/user_profilesをupsert
- **出力**: 200 + 更新後設定
- **例外**: ERR_VALIDATION(400)
- **関連画面**: SCR-116 / **関連API**: API-603 / **関連テーブル**: user_settings, user_profiles

### FN-607 セーブデータ取得
- **中分類**: セーブ / **機能名**: セーブデータ取得
- **機能概要**: 再開判定用にセーブ状況（進行中ランの有無・階層・キャラ・保存日時）を返す。API-304と統合可（CORE_SPEC）のため、MVPではAPI-304の応答に集約する（（仮決定））
- **利用者**: 全 / **MVP**: ○ / **優先度**: 中
- **前提条件**: 認証済み
- **入力**: なし
- **処理**: dungeon_runs(status=active)のメタ情報のみ返す軽量版（run_state全体は返さない）
- **出力**: 200 + { hasActiveRun, summary? }
- **例外**: ERR_AUTH_UNAUTHORIZED(401)
- **関連画面**: SCR-101, SCR-201 / **関連API**: API-604（API-304と統合可） / **関連テーブル**: dungeon_runs

---

## 8. 運用・管理（FN-7xx）

### FN-701 マスタデータシード投入
- **中分類**: マスタ管理 / **機能名**: シードスクリプト実行
- **機能概要**: Git管理された型付きマスタ定義（scripts/seed/data/*.ts）を全マスタテーブルへupsert投入する（DEC-013）。削除は is_active=false の論理無効化
- **利用者**: 管・開 / **MVP**: ○ / **優先度**: 高
- **前提条件**: PRレビュー済み定義。本番はメンテ中またはユーザー影響なしの追加のみ
- **入力**: `pnpm seed`（開発）/ `pnpm seed:prod`（本番、確認プロンプト）
- **処理**: Zodでマスタ定義を検証 → code列キーでupsert → 参照整合チェック（skill_effects→skills等） → FN-702へバージョン記録 → audit_logs記録
- **出力**: 投入結果サマリ（追加/更新/無効化件数）
- **例外**: 検証エラーで全件ロールバック（トランザクション実行）
- **関連画面**: — / **関連API**: なし（将来 /api/v1/admin/master） / **関連テーブル**: 全マスタテーブル, master_data_versions, audit_logs

### FN-702 マスタデータバージョン管理
- **中分類**: マスタ管理 / **機能名**: マスタバージョン記録
- **機能概要**: シード投入ごとにmaster_data_versionsへversion（例: 2026.07.12-1）・適用日時・差分概要を記録する。クライアントはバージョン変化でマスタキャッシュ（TanStack Query）を破棄する
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: FN-701実行時
- **入力**: version文字列、差分概要
- **処理**: 1行挿入。最新versionは全API応答ヘッダ `X-Master-Version` に付与
- **出力**: 最新バージョン
- **例外**: —
- **関連画面**: — / **関連API**: 全API（ヘッダ） / **関連テーブル**: master_data_versions

### FN-703 お知らせ管理
- **中分類**: お知らせ管理 / **機能名**: お知らせ登録・更新
- **機能概要**: announcementsへの登録・更新・公開/非公開切替。MVPはscripts/ops/のSQLテンプレート（audit_logs記録付き）で運営者が実施
- **利用者**: 管・運 / **MVP**: ○（SQL運用） / **優先度**: 中
- **前提条件**: 掲載文面の確定
- **入力**: title, body(Markdown), category, published_at, expires_at, is_published
- **処理**: INSERT/UPDATE + audit_logs記録。反映は即時（API-104はキャッシュ60秒）
- **出力**: 掲載されたお知らせ
- **例外**: —（SQL誤りは運用手順書のレビューで防止）
- **関連画面**: SCR-115 / **関連API**: API-104（配信）、将来 /api/v1/admin/announcements / **関連テーブル**: announcements, audit_logs

### FN-704 メンテナンスモード制御
- **中分類**: メンテナンス / **機能名**: メンテナンス開始・終了
- **機能概要**: maintenance_settingsの更新で全APIを503+ERR_MAINTENANCEに切り替える。allowed_roles（developer等）は通過可。クライアントはSCR-009を表示
- **利用者**: 管・運・開 / **MVP**: ○（SQL運用） / **優先度**: 高
- **前提条件**: 原則24時間前告知（FN-703）。緊急時は事後告知可
- **入力**: is_maintenance, starts_at, ends_at, message, allowed_roles
- **処理**: UPDATE + audit_logs記録 → ミドルウェアが60秒キャッシュで反映 → 終了時に復旧告知
- **出力**: メンテ状態。API応答: 503 { errorCode: "ERR_MAINTENANCE", details: { endsAt } }
- **例外**: ヘルスチェックはメンテ判定対象外（監視継続のため）
- **関連画面**: SCR-009 / **関連API**: 全API（ミドルウェア） / **関連テーブル**: maintenance_settings, audit_logs, announcements

### FN-705 監査ログ記録
- **中分類**: 監査 / **機能名**: 監査ログ
- **機能概要**: 運営操作（シード投入/メンテ切替/お知らせ/補填/BAN）とセキュリティ重要イベント（引き継ぎ/退会/ロック発生）をaudit_logsへ記録する。保持1年
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: 対象操作の実行
- **入力**: actor_user_id, actor_role, action, target_type, target_id, before/after(JSONB), ip
- **処理**: 各ユースケース/運用SQLテンプレートから挿入。更新・削除は禁止（追記専用）
- **出力**: 監査証跡
- **例外**: 挿入失敗時、運営操作は中断・ユーザー操作は続行しWARNログ（（仮決定））
- **関連画面**: — / **関連API**: API-006, API-008 ほか / **関連テーブル**: audit_logs

### FN-706 ヘルスチェック
- **中分類**: 監視 / **機能名**: ヘルスチェック
- **機能概要**: 死活監視用エンドポイント。アプリ稼働とDB接続（SELECT 1）を確認して200/503を返す。外形監視（5分間隔）から呼ばれる
- **利用者**: シ（監視サービス） / **MVP**: ○ / **優先度**: 高
- **前提条件**: なし（認証不要・メンテ判定除外・レート制限緩和）
- **入力**: なし
- **処理**: DB疎通確認（タイムアウト3秒） → { status: "ok", db: "ok", version } を返す
- **出力**: 200 or 503
- **例外**: DB断で503
- **関連画面**: — / **関連API**: /api/health（API ID体系外の運用エンドポイント） / **関連テーブル**: なし

### FN-707 レート制限
- **中分類**: 不正対策 / **機能名**: レート制限
- **機能概要**: 認証系5回/分/IP、その他60回/分/ユーザー（CORE_SPEC §7）。超過は429+ERR_RATE_LIMITED+Retry-Afterヘッダ
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: なし
- **入力**: リクエスト（IP・userId）
- **処理**: 固定ウィンドウカウンタ（MVPはNeon上のカウンタテーブルまたはVercel KV相当。（仮決定）: 実装方式は13_API_Design.mdで確定）で計数・判定
- **出力**: 通過 or 429
- **例外**: カウンタ障害時はフェイルオープン（制限なし通過）でWARNログ
- **関連画面**: SCR-010 / **関連API**: 全API / **関連テーブル**: （実装方式による）

### FN-708 冪等性制御
- **中分類**: 整合性 / **機能名**: Idempotency-Key制御
- **機能概要**: ラン系変更API（API-303,305,306,307,402,502〜508）とAPI-203,204でIdempotency-Keyヘッダを必須とし、同一キー再送には初回結果を再返却する（二重実行防止）。run_state.versionの楽観ロックと併用
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: クライアントがUUIDv4キーを生成・リトライ時に再利用
- **入力**: Idempotency-Keyヘッダ + リクエスト
- **処理**: キー+userId+エンドポイントで記録（保持24時間） → 処理中の同キーはERR_DUPLICATE_REQUEST(409) → 完了済みは保存済み応答を返却
- **出力**: 初回実行結果（再送時は同一応答）
- **例外**: キー欠落はERR_VALIDATION(400)
- **関連画面**: — / **関連API**: 上記変更系API / **関連テーブル**: （冪等キー記録テーブル。13_API_Design.mdで確定）

### FN-709 構造化ログ出力
- **中分類**: ログ / **機能名**: アプリケーションログ
- **機能概要**: 全APIでJSON構造化ログ（timestamp, level, traceId, userId, apiId, path, status, latencyMs, errorCode）をVercel標準ログへ出力する（DEC-020: error_logsテーブルは作らない。将来Sentry）
- **利用者**: シ / **MVP**: ○ / **優先度**: 高
- **前提条件**: なし
- **入力**: リクエスト/レスポンス/例外
- **処理**: ミドルウェア+エラーハンドラで出力。traceIdはエラー応答のtraceIdと一致させ問い合わせ調査に使う。個人情報（email・パスワード）はログ出力禁止
- **出力**: 構造化ログ（Vercelで保持・検索）
- **例外**: —
- **関連画面**: — / **関連API**: 全API / **関連テーブル**: なし（DEC-020）

### FN-710 バックアップ・リストア運用
- **中分類**: データ保全 / **機能名**: バックアップ・リストア
- **機能概要**: Neon PITR（7日）+ 日次論理バックアップ（pg_dumpをGitHub Actions cronで実行し外部ストレージ保存）。RPO24h/RTO4h。手順詳細は04章§11
- **利用者**: 管・開 / **MVP**: ○ / **優先度**: 高
- **前提条件**: バックアップ保存先の暗号化・アクセス制限
- **入力**: なし（日次自動）/ リストア時: 復旧目標時点
- **処理**: 日次dump→保存（30日分保持）→ 四半期ごとにリストア訓練。障害時はPITR優先、7日超過はdumpから復元
- **出力**: バックアップアーカイブ / 復旧済みDB
- **例外**: バックアップ失敗はActions通知で検知し当日中に再実行
- **関連画面**: — / **関連API**: なし / **関連テーブル**: 全テーブル

### FN-711 退会データ物理削除バッチ
- **中分類**: データ保全 / **機能名**: 退会データ削除
- **機能概要**: 論理削除から30日経過したユーザーの全データ（users以下関連テーブル）を物理削除する日次バッチ（Vercel Cron）。削除件数をaudit_logsに記録
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: FN-008で論理削除済み・30日経過
- **入力**: なし（日次実行）
- **処理**: deleted_at + 30日 < now のusersを抽出 → 関連テーブルをFK順に削除（currency_transactions等の監査系はuser_idを匿名化して1年保持。（仮決定））
- **出力**: 削除サマリ
- **例外**: 失敗時は翌日リトライ（冪等）
- **関連画面**: — / **関連API**: なし（Cron） / **関連テーブル**: users以下ユーザー系全テーブル, audit_logs

### FN-712 期限切れデータ削除バッチ
- **中分類**: データ保全 / **機能名**: 保持期限削除
- **機能概要**: 保持期間超過データの日次削除。battle_logs30日 / audit_logs1年 / 冪等キー24時間 / finalizedから90日超のdungeon_runs・スナップショット（統計値はplayer_progressに集約済みのため削除可。（仮決定））/ 90日ログインなしゲスト
- **利用者**: シ / **MVP**: ○ / **優先度**: 中
- **前提条件**: なし
- **入力**: なし（日次実行、Vercel Cron）
- **処理**: 各テーブルの期限条件でDELETE（バッチサイズ分割で長時間ロック回避）
- **出力**: 削除サマリ（構造化ログ）
- **例外**: タイムアウト時は翌日継続（冪等）
- **関連画面**: — / **関連API**: なし（Cron） / **関連テーブル**: battle_logs, audit_logs, dungeon_runs, dungeon_run_snapshots, users

### FN-713 管理API名前空間予約
- **中分類**: 将来拡張 / **機能名**: /api/v1/admin スタブ
- **機能概要**: /api/v1/admin/* を予約し、requireRole(['admin','operator','developer'])ガード＋404スタブを配置する（DEC-013、02章§3.4）。一般ユーザーにはERR_FORBIDDEN(403)
- **利用者**: 管・運・開（将来） / **MVP**: ○（スタブのみ） / **優先度**: 低
- **前提条件**: users.role列・ガード関数の実装
- **入力**: /api/v1/admin/* へのリクエスト
- **処理**: 認証→ロール検証→（権限あり）ERR_NOT_FOUND(404、未実装）/（権限なし）ERR_FORBIDDEN(403)
- **出力**: 403 or 404
- **例外**: —
- **関連画面**: —（管理画面UIは将来） / **関連API**: /api/v1/admin/*（将来採番） / **関連テーブル**: users（role列）

### FN-714 問い合わせ対応
- **中分類**: サポート / **機能名**: 問い合わせ対応（メール）
- **機能概要**: サポートメールでの受付・調査・回答（02章§2.7）。MVPはシステム外業務だが、調査にtraceId（FN-709）・currency_transactions・battle_logs・audit_logsを使用する
- **利用者**: 管・運 / **MVP**: ○（メール運用） / **優先度**: 中
- **前提条件**: SCR-116/117にメールアドレスと記載事項（ユーザーID・日時・画面・traceId）を案内済み
- **入力**: 問い合わせメール
- **処理**: 一次返信（3営業日以内）→ ログ・DB調査 → 回答/補填（補填はO-06手順: currency_transactions理由コードsupport_grant + audit_logs）
- **出力**: 回答メール、（必要時）補填
- **例外**: 本人確認不可（ゲスト等）の場合は一般的な回答に留める
- **関連画面**: SCR-116, SCR-117 / **関連API**: なし / **関連テーブル**: currency_transactions, battle_logs, audit_logs

---

## 未決事項

| ID | 内容 | 関連機能 |
|---|---|---|
| ISSUE-010 | 永続強化ツリー表示のAPI帰属（API-102同梱かAPI-204のGET追加か。（仮決定）で同梱） | FN-204 |
| ISSUE-011 | お知らせ既読管理をLocalStorageとする（仮決定）の確定 | FN-104 |
| ISSUE-012 | レート制限・冪等キー記録の実装方式（Neonテーブル / Vercel KV相当） | FN-707, FN-708 |
| ISSUE-013 | 戦闘中リタイアの可否と挙動（（仮決定）: 可・即ラン終了） | FN-312 |
| ISSUE-014 | レリック重複時の代替報酬（（仮決定）: ゴールド）の金額基準 | FN-505 |
| ISSUE-015 | finalizedランの保持期間90日（（仮決定））の確定 | FN-712 |
| ISSUE-016 | ショップ退店をAPI確定にするか（（仮決定）: API-504のaction=leave） | FN-311 |

## 実装時の注意点

1. ラン系変更API（FN-305〜314, FN-403, FN-502〜505）は「Idempotency-Key検証 → versionチェック → 状態遷移検証（position.phase）→ ドメイン処理 → run_state保存」の共通パイプラインを1箇所（server/usecases共通層）に実装し、個別実装のばらつきを禁止する
2. PRNG（DEC-019）はrngCursorを消費した回数だけ必ず進め、run_state保存前に更新後カーソルを書き込むこと。抽選のやり直し（リロール等）も新カーソルから引く（結果の先読み・巻き戻し防止）
3. FN-314（リザルト確定）は通貨・ランク・図鑑・実績・statusの更新を必ず単一DBトランザクションにする。二重付与はERR_REWARD_ALREADY_CLAIMEDとstatus遷移ガード（finalized不可逆）の二重で防ぐ
4. クライアントへ返すbattleビュー・runStateビューには、敵の将来行動・未開封報酬の中身・PRNG内部状態（seed/cursor）を含めない（情報チートの防止）
5. FN-501の3択候補は「提示時にrun_stateへ保存」し、取得APIの再呼び出しで再抽選しないこと（リロード連打での引き直し防止）
6. 機能追加時のFN採番は各大分類の末尾連番を使い、欠番の再利用はしない

## 関連設計書

- CORE_SPEC（設計共通仕様）— 画面・API・テーブル・数式の単一情報源
- docs/02_System_Requirements.md — 業務要件・ロール定義（利用者列の根拠）
- docs/04_Non_Functional_Requirements.md — レート制限・セッション・保持期間の数値根拠
- docs/05_Game_Design.md — バランス数値の詳細
- docs/13_API_Design.md — API-NNNごとのリクエスト/レスポンス詳細
- docs/12_Database_Design.md — テーブル物理設計
- docs/15_Save_Data_Design.md — run_state JSONB詳細・スナップショット復元
- docs/18_Skill_Design.md — スキル20種の個別マスタ
