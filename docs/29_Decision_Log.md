# 29. 意思決定ログ（Decision Log）

## 目的
本プロジェクトの技術選定・ゲーム仕様に関する重要な意思決定を記録し、後から「なぜそうしたか」を追跡可能にする。
全設計書はこのログのDEC-NNNを参照する。決定を覆す場合は本ログに新しい行を追加し、旧決定をSupersededにする。

## 記載ルール

| 項目 | 内容 |
|---|---|
| ID | DEC-NNN（欠番を再利用しない） |
| 状態 | Accepted（採用）/ Proposed（提案中）/ Superseded（置換済み） |
| 決定日 | 決定した日付 |
| 仮決定 | 実装・検証によって見直す可能性が高いものに付与 |

---

## DEC-001: アプリ名は「Rogue Chronicle」を継続採用（仮決定）
- 状態: Accepted（仮決定） / 決定日: 2026-07-12
- 背景: 仮称のまま開発を進めるか、正式名称を先に決めるかの判断が必要。候補10案を比較（00_Project_Overview.md参照）。
- 決定: Rogue Chronicle を正式名称候補の第一位として継続採用する。
- 理由: 図鑑・実績・ストーリーなど「記録（Chronicle）が積み上がる」という永続成長のゲーム性と名称が一致する。リポジトリ名・ドメイン候補とも整合し、開発途中のリネームコストを避けられる。
- 代替案: 深淵年代記、Everdelve など和名・造語案。ストア公開時（ネイティブ化検討時）に商標・既存アプリ重複を調査のうえ最終確定する。

## DEC-002: 戦闘方式はターン制コマンドバトル
- 状態: Accepted / 決定日: 2026-07-12
- 背景: ターン制/セミオート/リアルタイムアクション/カードバトル/オート+スキル選択/グリッドタクティカルの6方式を、個人開発難易度・スマホ操作性・ローグライト相性・繰り返し遊びやすさ・UI実装難易度・バランス調整・拡張性の7観点で比較（16_Battle_Design.md参照）。
- 決定: ターン制コマンドバトル（1キャラ vs 敵1〜3体）を採用。
- 理由:
  - サーバー権威（DEC-007）と最も相性が良い。1行動=1APIリクエストで完結し、リアルタイム同期が不要。
  - 個人開発での実装・テスト・バランス調整コストが最小。戦闘ロジックを純粋関数として単体テストできる。
  - スマホ縦画面のタップ操作で完結し、誤操作リスクが低い。
  - 通信断・中断・再開に強い（ターン境界で常に保存可能）。
- 代替案の不採用理由: リアルタイム系はサーバー検証が困難でチート耐性が下がる。カードバトルはStS系との差別化が難しくカード資産の制作量が大きい。グリッド型はUI実装・AI実装コストが個人開発の許容範囲を超える。
- 将来: オート戦闘・倍速はターン制の上にそのまま載せられる（行動選択の自動化のみ）。

## DEC-003: ダンジョンはノード選択型マップ
- 状態: Accepted / 決定日: 2026-07-12
- 背景: ノード選択型 vs ランダムマップ型（グリッド探索）の比較。
- 決定: Slay the Spire型の列グラフ（10階層・各階層2〜4ノード）を採用。
- 理由: スマホで「見て・選ぶ」だけの操作で成立し、1ラン15〜30分に収めやすい。生成アルゴリズムが単純で、シードによる再現・検証・不正防止（隣接ノード検証）が容易。マップ全体の見通しが「ルート戦略」という意思決定を生む。
- 将来: ランダムマップ型は新モード（探索型ダンジョン）として追加可能な構造にする。

## DEC-004: フレームワークはNext.js（App Router）+ TypeScript + React
- 状態: Accepted / 決定日: 2026-07-12
- 理由: Vercelデプロイ前提との親和性が最高。フロント・APIを1リポジトリ・1言語で完結でき個人開発の認知負荷が最小。App RouterのRoute HandlersでREST APIを実装でき、将来のServer Components活用余地もある。
- 代替案: Remix（Vercel最適化で劣る）、SPA+別APIサーバー（運用コスト増）、SvelteKit（エコシステム規模）。
- 切替条件: リアルタイム系機能（PvP等）が必要になった場合はWebSocketサーバーの分離を検討。

## DEC-005: DBはPostgreSQL（Neon）+ Prisma
- 状態: Accepted / 決定日: 2026-07-12
- 理由: JSONB（run_state・スキル効果パラメータ）とリレーショナル整合性（通貨・図鑑・実績）を両立できる。Neonはサーバーレス向けコネクションプーリング・ブランチ機能・無料枠があり、Vercelとの接続実績が豊富。PrismaはTypeScript型生成とマイグレーション管理で個人開発の生産性が高い。
- 代替案: Supabase（Auth等多機能だがAuth.jsと責務が重複、DB単体利用ならNeonの方が軽い）、PlanetScale（MySQL、JSONB相当が弱い）。
- 切替条件: PrismaのコールドスタートやクエリパフォーマンスがAPI p95目標を阻害する場合、Drizzle ORMへの移行を検討（repositoryレイヤで吸収）。

## DEC-006: 認証はMVPで「ゲスト + メール/パスワード」（Auth.js）
- 状態: Accepted / 決定日: 2026-07-12
- 理由: ゲストプレイは離脱防止の最重要導線（登録なしで即プレイ）。メール/パスワードは外部依存なしで実装可能。OAuth（Google/GitHub/Apple）はAuth.jsのProvider追加のみで後付けできるため、MVPではコンソール設定・審査コストを回避。
- 注意: パスワード再設定はメール送信基盤（Resend等）が必要なため将来対応（ISSUE-002）。MVP期間中はゲスト→正式引き継ぎを推奨導線とする。

## DEC-007: 戦闘結果・報酬はサーバー権威（クライアントを信用しない）
- 状態: Accepted / 決定日: 2026-07-12
- 背景: Webゲームはクライアント改ざん・API直接呼び出しが容易であり、「クライアントから送信された戦闘結果を無条件に信用しない」ことが要件。
- 決定: クライアントは「選択」（行動種別・対象・ノードID・3択のインデックス）のみを送信する。ダメージ計算・命中/クリティカル判定・報酬抽選・マップ生成・乱数は全てサーバーで実行し、結果と新しいrun_stateをクライアントへ返す。クライアントは受信したactionLogを演出として再生するのみ。
- コスト: 1行動=1APIリクエストとなり通信回数が増える。→ ターン制（DEC-002）採用によりリクエスト頻度は人間の操作速度に律速され許容範囲。
- 派生ルール: シード付きPRNG（DEC-019）、楽観ロック、冪等キー、pendingReward状態遷移。

## DEC-008: 状態管理はTanStack Query + Zustand + React Hook Form/Zod
- 状態: Accepted / 決定日: 2026-07-12
- 決定: サーバー状態（ラン・戦闘・プレイヤー情報）=TanStack Query、クライアント演出状態（アニメーション再生キュー・UIフラグ）=Zustand、フォーム=React Hook Form+Zod、共有すべきURL状態=URLパラメータ。
- 理由: ゲーム進行の真実はサーバー（DEC-007）にあるため、「サーバー状態のキャッシュ・再取得・楽観更新」を担うTanStack Queryが主役。Redux Toolkitは規模過剰。React Contextは再レンダリング制御が難しく演出用途に不向き。
- 禁止: 重要進行データ（run_state・通貨）をLocalStorage/IndexedDBに保存しない。LocalStorageは設定・音量・チュートリアル既読フラグのみ。

## DEC-009: 演出はCSS Animation + Framer Motionのみ（ゲームエンジン不採用）
- 状態: Accepted / 決定日: 2026-07-12
- 理由: MVPの演出要件（ダメージ数字・カード出現・画面遷移・ボス登場）はDOM+CSS+Framer Motionで60fps達成可能。PixiJS/Phaser/Three.jsは学習・実装・バンドルサイズのコストがMVP価値に見合わない。
- 切替条件: (1)パーティクル・多数同時アニメーションで実測60fpsを維持できない場合に戦闘演出層のみPixiJSを部分導入、(2)3D表現が企画上必須になった場合にThree.js検討。UIロジックと演出層を分離しておくことで部分置換を可能にする。

## DEC-010: UIはTailwind CSS + shadcn/ui
- 状態: Accepted / 決定日: 2026-07-12
- 理由: shadcn/uiはコード所有型でゲームUI向けのカスタム（ダークファンタジーテーマ化）が容易。Tailwindはレスポンシブ対応・デザイントークン管理と相性が良い。
- 代替案: MUI/Chakra（テーマの自由度とバンドルサイズで不利）。

## DEC-011: ラン中データはdungeon_runs.run_state（JSONB）+ 楽観ロック
- 状態: Accepted / 決定日: 2026-07-12
- 背景: ラン中データを正規化テーブル群（dungeon_run_skills等 約10テーブル）で持つ案とJSONB集約案を比較。
- 決定: 1ランの状態を run_state JSONB 1カラムに集約し、version列で楽観ロック、dungeon_run_snapshotsで世代管理する。
- 理由: ラン中データは常に「1ラン分を丸ごと読み書き」するアクセスパターンであり、正規化の利点（部分更新・横断集計）がほぼない。JSONB集約により、状態遷移が1UPDATEでアトミックになり、スナップショット・破損検知・再開が単純化する。
- コスト: ラン中データへのSQL集計が困難。→ 集計が必要な確定データ（通貨・図鑑・実績・戦闘ログ）は正規化テーブルへ書き出す。schemaVersionフィールドでJSONB構造の移行に備える。

## DEC-012: プレイヤーはMVPで1キャラ編成
- 状態: Accepted / 決定日: 2026-07-12
- 理由: パーティ制は戦闘UI・バランス・行動順・スキル設計の複雑度を倍増させる。ローグライトの「ビルド構築」の面白さは1キャラ+スキル8枠+レリックで十分成立する。
- 将来: BattleStateのactor配列は複数プレイヤーキャラを許容する型にしておく（拡張余地）。

## DEC-013: 管理画面はMVPに含めない（土台のみ用意）
- 状態: Accepted / 決定日: 2026-07-12
- 決定: マスタデータはシードスクリプト（prisma/seed.ts + TypeScript定数）で管理し、管理UIは作らない。ただし users.role、audit_logs、/api/v1/admin 名前空間、announcements/maintenance_settingsテーブルは最初から用意する。
- 理由: 運営者=開発者1名の間はシード運用が最速・最安全（コードレビュー・Git履歴が監査を兼ねる）。
- 切替条件: 運営者が開発者以外に増える、またはお知らせ更新頻度が週1を超えたら管理画面（Phase 13以降）を実装。

## DEC-014: APIはREST（/api/v1）を基本とする
- 状態: Accepted / 決定日: 2026-07-12
- 背景: REST / Server Actions / tRPC を比較（13_API_Design.md参照）。
- 理由: 将来のネイティブアプリ化・PWA化でクライアントが増えても再利用できる。エンドポイント単位のレート制限・監視・冪等性設計が素直。tRPCは型安全性で勝るがNext.js外クライアントとの互換とAPI設計書ベースの開発に不向き。
- 例外: 認証フォーム等、画面に閉じた処理はServer Actionsの限定利用を許容。

## DEC-015: デザインテーマはダークファンタジー
- 状態: Accepted / 決定日: 2026-07-12
- 背景: ダークファンタジー/魔法図書館/王道ファンタジーの3案を比較（08_UI_UX_Design.md参照）。
- 理由: 遺跡・呪い・レリックというゲーム要素と世界観が一致。暗背景はスマホでの視認性・省電力・演出の映え（発光系エフェクト）に有利。アセットを最小限（色+シルエット+アイコン）で成立させやすい。

## DEC-016: 課金・ガチャは導入しない
- 状態: Accepted / 決定日: 2026-07-12
- 理由: 個人開発での決済・特商法・資金決済法対応はコストが大きすぎる。キャラ解放は実績・ソウルシャードによるゲーム内解放とし、レアリティ・ガチャ前提の設計（排出率・天井等）を最初から持たない。
- 影響: キャラにレアリティ概念を持たせない（05_Game_Design.md）。

## DEC-017: 装備マスタはequipment 1テーブルに統合
- 状態: Accepted / 決定日: 2026-07-12
- 理由: weapons/armors/accessoriesは属性がほぼ同一（名称・レア度・基礎能力・スロット）。slot列（weapon/armor/accessory）+CHECK制約で表現し、テーブル数・リポジトリ実装・図鑑処理を1/3にする。

## DEC-018: 図鑑はplayer_codex 1テーブルに統合
- 状態: Accepted / 決定日: 2026-07-12
- 理由: スキル/レリック/敵/装備/キャラ図鑑は「ユーザー×エントリ×発見日時」という同一構造。entry_type + entry_code の複合で統合し、UNIQUE(user_id, entry_type, entry_code)で重複登録を防ぐ。

## DEC-019: 乱数はシード付きPRNG（mulberry32相当）をサーバーで実行
- 状態: Accepted / 決定日: 2026-07-12
- 理由: (1)再現性: seed+rngCursorをrun_stateに保存することで、同一ランの再現・バグ調査・不正検証が可能。(2)将来の固定シードモード・デイリーダンジョン（全員同一マップ）の基盤になる。(3)Math.random()ではテスト不能。
- 実装ルール: domain層の関数はRngインターフェースを引数注入で受け取り、直接Math.random()を呼ばない。

## DEC-020: エラーログはVercel Logs + 構造化コンソールログ（error_logsテーブルなし）
- 状態: Accepted / 決定日: 2026-07-12
- 理由: DBへのエラーログ書き込みは「DB障害時にログも失う」矛盾があり、書き込みコストも無視できない。VercelのログストリームをMVPの一次ログとし、閾値監視はUptimeRobot+Vercel通知で代替。
- 切替条件: 正式公開後、エラー分析の頻度が上がったらSentry（無料枠）を導入。

## 今後の決定候補（Proposed）

| ID | テーマ | 期限目安 |
|---|---|---|
| DEC-021(予定) | 効果音・BGMの導入範囲と音源調達 | Phase 10 |
| DEC-022(予定) | PWA化の実施時期とオフライン範囲 | 正式公開後 |
| DEC-023(予定) | Sentry導入 | 正式公開後1ヶ月 |
| DEC-024(予定) | パスワード再設定のメール基盤（Resend） | Phase 13 |

## 追補: 各設計書ローカルの仮決定一覧（登録簿）

採番ルール: グローバル決定 = DEC-001〜020（+今後は029まで予約）。文書ローカルの仮決定は本登録簿に必ず記載し、番号の重複を禁止する。新規採番は本表の空き番号を使用する。

| DEC番号 | 決定内容の一行要約 | 出典文書 |
|---|---|---|
| DEC-030 | SPは戦闘終了時にリセットせず、次の戦闘開始時にmaxSpまで回復する（SP回復内訳の定義） | 16_Battle_Design.md |
| DEC-031 | 攻撃は命中・回避に関わらずSP+1を付与。heal/buff/自己対象スキルは必中 | 16_Battle_Design.md |
| DEC-032 | MVP消耗品アイテムは3種、所持上限は各コード5個（超過獲得は破棄しゴールド+10G換算） | 16_Battle_Design.md |
| DEC-033 | 戦闘バランス初期案の早見表数値（敵基礎ステータス等） | 16_Battle_Design.md |
| DEC-034 | stunは次の行動を1回スキップ。stun中の対象への再付与は無効（連続スタンハメ防止） | 16_Battle_Design.md |
| DEC-035 | 状態異常の効果値・持続ターンのMVP初期値（スキル・レリック側で上書き可） | 16_Battle_Design.md |
| DEC-036 | 敵は保存済みintentを再抽選せず実行。対象・条件が無効化された場合は通常攻撃へフォールバック | 16_Battle_Design.md |
| DEC-037 | ボス（ruin_guardian）の3フェーズ仕様の具体数値（CORE_SPEC §5.7の具体化） | 16_Battle_Design.md |
| DEC-038 | ゴールド報酬式 = floor(Σ baseGold × (1 + 0.10 × (floor - 1)) × rand(0.9〜1.1)) | 16_Battle_Design.md |
| DEC-039 | スキルレベル反映式: 実効skillMult = skillMult × (1 + 0.15 × (level - 1))。SPコスト不変 | 16_Battle_Design.md |
| DEC-040 | ノードタイプはdungeon_node_typesマスタ登録・アイコンはlucide-react基本。BLESSは3択、HEALはHP35%回復+25%でポーション | 17_Dungeon_Design.md |
| DEC-041 | SECRET隠し部屋: rare以上確定の装備1個+60G。マップ全体10%でEVENT系ノードから置換 | 17_Dungeon_Design.md |
| DEC-042 | ノード配置の固定枠・保証枠を除く重み表と、割当違反時のフォールバック規則 | 17_Dungeon_Design.md |
| DEC-043 | イベントは等重み抽選（直前に見たものは除外）。数値はサーバー処理、イベントによる死亡なし（HP下限1） | 17_Dungeon_Design.md |
| DEC-044 | TREASUREノードはreward_tablesのrt_treasure_normalを参照して1回抽選 | 17_Dungeon_Design.md |
| DEC-045 | ショップ価格式 = floor(基準価格 × (1 + 0.1 × 階層)) と基準価格の初期値 | 17_Dungeon_Design.md |
| DEC-046 | クリア時はソウルシャード獲得率100%+クリアボーナス（ソウルシャード+50） | 17_Dungeon_Design.md |
| DEC-050 | 敵共通パラメータの定義。intent表示はアイコンのみで予測ダメージ帯は表示しない | 19_Enemy_AI_Design.md |
| DEC-051 | 敵別の行動一覧・AIルール表の数値 | 19_Enemy_AI_Design.md |
| DEC-052 | 敵ドロップはreward_tables参照方式（通常10%・強敵30%・エリート50%・ボス100%） | 19_Enemy_AI_Design.md |
| DEC-053 | shamanの召喚仕様: 場は最大3体、召喚スライムはEXP・ゴールド・ドロップ0、行動は次ターンから | 19_Enemy_AI_Design.md |
| DEC-054 | skeleton_guardのカウンター仕様: 被ダメ50%減+直接ダメージ被弾ごとにskill_mult 0.5で反撃（1ターン最大2回） | 19_Enemy_AI_Design.md |
| DEC-055 | 敵図鑑はplayer_codex連携（召喚スライムの撃破も登録・kills集計対象） | 19_Enemy_AI_Design.md |
| DEC-056 | 将来Hard: difficultyMod 1.3 + enemy_ai_rulesにdifficulty列を追加するデータ駆動のAIルール追加方式 | 19_Enemy_AI_Design.md |
| DEC-057 | 敵編成（スポーン）ルール: ノード種別ごとの敵数分布とプール抽選（同種最大2体） | 19_Enemy_AI_Design.md |
| DEC-081 | 横画面検出時は半透明オーバーレイで縦画面推奨を表示（強制ブロックはしない） | 08_UI_UX_Design.md |
| DEC-082 | ホーム系・準備系・認証系・共通画面は中央寄せmax-width 768px | 08_UI_UX_Design.md |
| DEC-083 | 初回出撃は短縮5階層の専用チュートリアルランを強制（スキップ不可） | 08_UI_UX_Design.md |
| DEC-084 | 「魔法図書館」要素は図鑑・実績・リザルトの「記録される」演出モチーフとしてサブテーマ化 | 08_UI_UX_Design.md |
| DEC-085 | ライトテーマは提供しない（ダークファンタジー固定） | 08_UI_UX_Design.md |
| DEC-086 | 見出し・演出文字のフォントはShippori Mincho | 08_UI_UX_Design.md |
| DEC-087 | ゲーム内シンボルは絵文字を第一実装とし、GameIconコンポーネントに集約（将来SVG差し替え可能） | 08_UI_UX_Design.md |
| DEC-088 | 画像アセットは「キャラ立ち絵・敵スプライト・ボス背景1枚」の最小限に限定 | 08_UI_UX_Design.md |
| DEC-089 | アクセシビリティは「ナビゲーションと状態把握が可能」レベルを保証（完全対応はMVPスコープ外） | 08_UI_UX_Design.md |
| DEC-091 | 監視はVercel Analytics + /api/v1/healthの外形監視（UptimeRobot無料枠） | 10_System_Architecture.md |
| DEC-092 | 画像・効果音はpublic/同梱でVercel CDN配信（アセット総量50MB以内目安、外部ストレージ不要） | 10_System_Architecture.md |
| DEC-093 | Canvas演出は部分導入方式（DOMのUIレイヤー+Canvasの演出レイヤー重ね）、全面置換はしない | 10_System_Architecture.md |
| DEC-094 | 戦闘・ラン系mutationは楽観更新をしない（成功応答でsetQueryData更新） | 10_System_Architecture.md |
| DEC-095 | features/からdomain/shared純粋関数への参照を例外許可（表示用計算が必要な場合のみ） | 10_System_Architecture.md |
| DEC-096 | コールドスタート対策一式。p95 500msはウォーム時基準、コールド時は操作応答1秒以内を許容 | 10_System_Architecture.md |
| DEC-097 | Vercel関数リージョン東京（hnd1）、Neonはap-southeast-1（東京提供時は移行）に固定 | 10_System_Architecture.md |
| DEC-098 | 冪等キー・レート制限テーブルはDB実装（サーバーレスのためインメモリ不可） | 11_Module_Design.md |
| DEC-101 | マスタ系PKは連番int（IDENTITY）+ UNIQUEなcode(text)の併用 | 12_Database_Design.md |
| DEC-102 | idempotency_keysテーブルを追加、応答キャッシュは24時間保持 | 12_Database_Design.md |
| DEC-103 | battle_logsの保持期間は30日（日次削除バッチ） | 12_Database_Design.md |
| DEC-106 | 消費アイテムはマスタテーブル化せずTypeScript定数 + run_state.itemsで管理 | 12_Database_Design.md |
| DEC-107 | audit_logsの保持期間は1年 | 12_Database_Design.md |
| DEC-108 | 容量見積の前提値（1年後: 登録5,000/アクティブ1,000/DAU 100/1日300ラン） | 12_Database_Design.md |
| DEC-109 | 休眠ゲストは最終ログインから180日で削除（部分INDEXで対応） | 12_Database_Design.md |
| DEC-110 | 表示名の重複は許容（一意化しない） | 12_Database_Design.md |
| DEC-111 | マスタ横断のcode参照はFKを張らずアプリで検証（player_codex.code等） | 12_Database_Design.md |
| DEC-112 | goldはサーバー権威の主要増減のみcurrency記録（残高権威はrun_state）。soul_shardsは全増減記録 | 12_Database_Design.md |
| DEC-113 | difficulty列はdungeon_difficulties.codeと対応（FKなし・アプリ検証） | 12_Database_Design.md |
| DEC-114 | maintenance_settingsはアプリ側で60秒キャッシュ | 12_Database_Design.md |
| DEC-131 | セッションCookieは`__Host-rc.session-token`（httpOnly + Secure + SameSite=Lax） | 13_API_Design.md |
| DEC-132 | 管理者判定はusers.role = 'admin'（管理APIは土台のみ、エンドポイント非公開） | 13_API_Design.md |
| DEC-133 | 成功レスポンスはエンベロープなしでリソース直接返却（traceIdはX-Trace-Idヘッダ） | 13_API_Design.md |
| DEC-134 | 冪等性の受理記録は専用テーブルを追加せずdungeon_runs.run_state内に保持 | 13_API_Design.md |
| DEC-135 | レート制限はMVPでは関数内インメモリLRUのベストエフォート。ログイン試行ロックのみDB厳密管理 | 13_API_Design.md |
| DEC-136 | 一覧APIはカーソル方式ページネーション（limit最大50、既定20） | 13_API_Design.md |
| DEC-137 | run_stateはクライアント公開用の投影（RunView）に変換して返す | 13_API_Design.md |
| DEC-138 | 退会は論理削除+全セッション失効を1Tx、7日間の猶予後に物理削除（期間中の復帰導線なし） | 13_API_Design.md |
| DEC-139 | パス変数characterId等はCORE_SPECどおりの変数名で、値はマスタcodeを用いる | 13_API_Design.md |
| DEC-140 | ストーリー既読の永続反映はAPI-307（finalize）に集約（ラン内はrun_stateのみ） | 13_API_Design.md |
| DEC-141 | 認証はAuth.jsのProvider配列追加だけでOAuth拡張可能な構成（将来拡張を見込んだ設計方針） | 14_Authentication_Design.md |
| DEC-142 | ゲストの引き継ぎ推奨モーダルはプレイヤーランク3到達および累計ラン3回時点で表示 | 14_Authentication_Design.md |
| DEC-143 | email重複時はERR_VALIDATION(400)+汎用文言（存在有無を悟らせない） | 14_Authentication_Design.md |
| DEC-144 | セッション照合結果は同一リクエスト内でメモ化（外部キャッシュはMVPでは使わない） | 14_Authentication_Design.md |
| DEC-145 | 退会の復帰猶予は30日間（MVPでは復帰機能なし、猶予のみ確保） | 14_Authentication_Design.md |
| DEC-151 | セーブUIは持たない。「進行は自動的にサーバーへ保存されています」の表示のみ | 15_Save_Data_Design.md |
| DEC-152 | 終了済みランはラン終了から7日後にバッチ削除 | 15_Save_Data_Design.md |
| DEC-153 | 全世代検証NG時はラン放棄補償: ソウルシャード100% + 固定補償50 | 15_Save_Data_Design.md |
| DEC-154 | run_state復旧はAPI-304呼び出し時点で復元済み状態を返す同期的な整理とする | 15_Save_Data_Design.md |
| DEC-181 | 必殺技はMVPでは「SPコスト8以上・倍率2.5以上のepicアクティブスキル」として表現（専用ゲージは将来） | 18_Skill_Design.md |
| DEC-182 | 固有スキル（is_innate=true）は開始時から自動所持・所持8枠の枠外 | 18_Skill_Design.md |
| DEC-183 | スキル進化は将来列（evolves_to_skill_id / evolve_condition）の枠組みのみ定義、MVP未実装 | 18_Skill_Design.md |
| DEC-184 | 得意武器一致の武器はbase_stats全数値+10%（端数切り捨て、最低+1） | 18_Skill_Design.md |
| DEC-185 | スキル報酬スキップ時の代替報酬はHP10%回復（maxHp比） | 18_Skill_Design.md |
| DEC-186 | 装備強化はMVP除外・将来対応（equipment.upgrade_config jsonb列を予約） | 18_Skill_Design.md |
| DEC-187 | synergy_tags一致でスキル抽選重みを補正（係数1.5、確定にはしない） | 18_Skill_Design.md |
| DEC-221 | CSPのscript-src 'unsafe-inline'はNext.js対応の暫定、将来nonce方式へ移行 | 22_Security_Design.md |
| DEC-222 | npm auditをCIに組み込み、High以上の脆弱性でCI失敗 | 22_Security_Design.md |
| DEC-240 | TypeScriptのenumは使わず`as const`オブジェクト + ユニオン型を使う | 24_Development_Guideline.md |
| DEC-241 | Prettier設定の内容（フォーマットは全てPrettierに委譲） | 24_Development_Guideline.md |
| DEC-250 | リポジトリ名はrogue-chronicle | 25_GitHub_Operation.md |
| DEC-251 | リポジトリ可視性はPrivate推奨 | 25_GitHub_Operation.md |
| DEC-252 | mainのbranch protection: PR必須・CIステータス必須・直push禁止（approval必須は設定しない） | 25_GitHub_Operation.md |
| DEC-253 | 公開時のライセンスはMITを第一候補（マスタデータ分離判断とセットで決定） | 25_GitHub_Operation.md |
| DEC-254 | ブランチ戦略はmain + developの簡易型（GitHub Flow寄り） | 25_GitHub_Operation.md |
| DEC-255 | マージは必ずPR経由・squash merge（1機能=1コミットの履歴維持） | 25_GitHub_Operation.md |
| DEC-256 | リリースPRもsquashで統一し、リリース内容はタグ + CHANGELOGで追跡 | 25_GitHub_Operation.md |
| DEC-257 | DBマイグレーションはVercelビルド時に`prisma migrate deploy`を実行 | 25_GitHub_Operation.md |
| DEC-260 | local / Preview / Productionの3環境構成 | 26_Release_Plan.md |
| DEC-261 | NeonリージョンはAWS ap-northeast-1（Tokyo）を選択 | 26_Release_Plan.md |
| DEC-262 | 独自ドメインは正式公開判定通過後に取得（それまでvercel.appドメインでコスト0円運用） | 26_Release_Plan.md |
| DEC-263 | DBはロールバックせず前方修正のみ。マイグレーション後方互換ルール（3段階）を全適用 | 26_Release_Plan.md |
| DEC-264 | メンテによる強制ラン終了は差分20%上乗せで実質100%補償（クリアボーナスなし） | 26_Release_Plan.md |
| DEC-265 | 無料枠有料化を検討する閾値（Neon compute月150時間超等）の定義 | 26_Release_Plan.md |
| DEC-270 | MVP完成（Phase 12終了）まで6〜9ヶ月を計画値とし、9ヶ月超過見込みでMVP範囲再削減を発動 | 27_Roadmap.md |
| DEC-271 | 戦闘バランス目標帯（初見クリア率5〜15%、10ラン後30〜50%）は仮置き、βの実測で見直す | 27_Roadmap.md |

- 注: DEC-104〜105は12_Database_Design.md内で欠番（未使用）。欠番は再利用しない（記載ルール準拠）。
- 注: DEC-047〜049 / 058〜080 / 090 / 099〜100 / 115〜130 / 146〜150 / 155〜180 / 188〜220 / 223〜239 / 242〜249 / 258〜259 / 266〜269 / 272以降は空き番号。

## 未決事項
- 本ログはDEC-001〜020を初期採録した。以後の決定は追記制とし、`28_Open_Issues.md` の課題が決着するたびに本ログへ転記する。

## 実装時の注意点
- 実装中に設計と異なる判断をした場合、コードコメントではなく必ず本ログに追記してから実装すること。
- Superseded にした決定も削除しない（履歴保全）。

## 関連設計書
- [00_Project_Overview.md](./00_Project_Overview.md) — 全体像とドキュメント構成
- [28_Open_Issues.md](./28_Open_Issues.md) — 未決事項一覧
- [10_System_Architecture.md](./10_System_Architecture.md) — 技術選定の詳細比較
- [16_Battle_Design.md](./16_Battle_Design.md) / [17_Dungeon_Design.md](./17_Dungeon_Design.md) — ゲーム方式の詳細比較
