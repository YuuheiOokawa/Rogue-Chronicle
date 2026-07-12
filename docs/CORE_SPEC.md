# Rogue Chronicle — 設計共通仕様（CORE SPEC）

このファイルは全設計書（docs/00〜29）の間で用語・ID・数値・構成を一致させるための単一情報源である。
各設計書はこの仕様と矛盾してはならない。ここに無い詳細は各設計書で具体化してよいが、
ここにある名称・ID・数式・一覧は**そのまま**使うこと。

---

## 1. プロジェクト概要

- 仮アプリ名: **Rogue Chronicle**（ろーぐくろにくる）
- ジャンル: ローグライトRPG（ラン型 / 永続成長あり）
- 対応: PCブラウザ / スマートフォンブラウザ / レスポンシブ / 将来PWA・ネイティブ化
- 1ラン: 15〜30分
- 開発: 個人開発、MVP→段階拡張
- デプロイ: Vercel / DB: Neon (クラウドPostgreSQL) / 言語: TypeScript

### 正式名称候補（10個 / 00_Project_Overview.md に記載）
1. Rogue Chronicle（現仮称・継続候補）
2. 深淵年代記（Abyss Chronicle）
3. Everdelve（エバーデルヴ）
4. 螺旋回廊（Spiral Corridor）
5. Runebound Depths（ルーンバウンド・デプス）
6. 忘却の遺跡（Ruins of Oblivion）
7. Chronicle Dive（クロニクルダイブ）
8. 迷宮残響（Labyrinth Echoes）
9. アストラルデルヴ（Astral Delve）
10. 終焉の書庫（The Last Archive）

推奨: **Rogue Chronicle** を正式名称として継続採用（仮決定 DEC-001）。理由: 図鑑・年代記＝「記録が残る」ゲーム性と一致、ドメイン/リポジトリ名も既に整合。

---

## 2. 主要決定事項（Decision Log と一致させること）

| ID | 決定 | 内容 |
|---|---|---|
| DEC-001 | アプリ名 | Rogue Chronicle を継続採用（仮決定） |
| DEC-002 | 戦闘方式 | ターン制コマンドバトル（1キャラ vs 敵1〜3体） |
| DEC-003 | マップ方式 | ノード選択型（Slay the Spire型の列グラフ） |
| DEC-004 | FW | Next.js (App Router) + TypeScript + React |
| DEC-005 | DB | PostgreSQL (Neon) + Prisma |
| DEC-006 | 認証 | MVP: ゲスト + メール/パスワード（Auth.js, JWTセッションCookie）。将来: Google/GitHub/Apple |
| DEC-007 | 戦闘結果のサーバー権威 | 戦闘計算・報酬抽選・乱数は全てサーバー側で実行。クライアントは行動選択のみ送信 |
| DEC-008 | 状態管理 | サーバー状態=TanStack Query / クライアント状態=Zustand / フォーム=React Hook Form+Zod |
| DEC-009 | 演出 | MVPはCSS Animation + Framer Motion のみ。Canvas/PixiJS/Phaser/Three.jsは不採用（将来切替条件を明記） |
| DEC-010 | UIライブラリ | Tailwind CSS + shadcn/ui |
| DEC-011 | ラン中データ | dungeon_runs.run_state (JSONB) に集約 + version列で楽観ロック |
| DEC-012 | プレイヤーパーティ | MVPは1キャラ編成（パーティ制は将来） |
| DEC-013 | 管理画面 | MVPには含めない。マスタデータはシードスクリプト+管理APIの土台のみ用意 |
| DEC-014 | API方式 | REST (route handlers, /api/v1)。Server Actionsは認証系フォームのみ限定利用可 |
| DEC-015 | デザインテーマ | ダークファンタジー採用（候補: ダークファンタジー / 魔法図書館 / 王道ファンタジー） |
| DEC-016 | 課金・ガチャ | 恒久的に導入しない前提でMVP設計（買い切り/広告も当面なし） |
| DEC-017 | 装備マスタ | weapons/armors/accessoriesは equipment 1テーブル + slot列に統合 |
| DEC-018 | 図鑑 | player_codex 1テーブルに entry_type で統合（スキル/レリック/敵/装備/キャラ） |
| DEC-019 | 乱数 | シード付きPRNG（mulberry32相当）をサーバーで実行。seedとcursorをDB保存し再現性確保 |
| DEC-020 | エラーログ | MVPはVercel標準ログ+コンソール構造化ログ。error_logsテーブルは作らない。将来Sentry |

---

## 3. ID体系（全設計書で統一）

| 種別 | 形式 | 例 |
|---|---|---|
| 画面 | SCR-NNN | SCR-101 ホーム画面 |
| API | API-NNN | API-303 ダンジョン開始 |
| 機能 | FN-NNN | FN-201 |
| テーブル | snake_case英語 | dungeon_runs |
| モジュール | PascalCase+Module | BattleModule |
| エラーコード | ERR_大分類_詳細 | ERR_AUTH_INVALID_CREDENTIALS |
| 決定 | DEC-NNN | DEC-007 |
| 未決事項 | ISSUE-NNN | ISSUE-003 |
| リスク | RISK-NNN | RISK-001 |
| テストケース | TC-NNN | TC-015 |
| キャラ/敵/スキル等マスタ | 英小文字スネークのcode列 | swordsman_rain, skill_flame_slash |

---

## 4. 用語統一

| 用語 | 意味 | 揺れ禁止 |
|---|---|---|
| ラン | 1回のダンジョン挑戦（dungeon_run） | 「挑戦」「周回」と混用しない。UI表記は「挑戦」可、設計用語は「ラン」 |
| ノード | マップ上の1マス | 「部屋」「マス」不可 |
| 階層 | floor（1〜10） | 「フロア」不可（コード上はfloor） |
| ゴールド | ラン内一時通貨（gold） | |
| ソウルシャード | 永続通貨（soul_shards） | 「魔石」不可 |
| プレイヤーランク | アカウントレベル（player_progress.rank） | |
| 永続強化 | 拠点の強化ツリー（upgrade_nodes） | 「恒久強化」不可 |
| レリック | ラン中の特殊効果収集物 | 「遺物」不可 |
| SP | スキルポイント（戦闘中のスキルコスト資源） | 「MP」不可 |
| 一時成長 | ラン内のみ有効な成長 | |
| 永続成長 | ラン終了後も残る成長 | |
| 状態異常 | 毒/麻痺/スタン等 | |
| 行動予告 | 敵の次行動表示（intent） | |

---

## 5. ゲーム仕様の骨子

### 5.1 ステータス（プレイヤー・敵共通）
| コード | 名称 | 戦闘への影響 |
|---|---|---|
| hp / maxHp | HP | 0で戦闘不能（プレイヤーは敗北） |
| atk | 攻撃力 | ダメージ計算の基礎値 |
| def | 防御力 | 被ダメージ軽減（逓減式） |
| spd | 素早さ | 行動順（降順）。同値はプレイヤー優先 |
| critRate | クリティカル率(%) | 基本5%。クリ発動判定 |
| critDmg | クリティカルダメージ(%) | 基本150% |
| eva | 回避率(%) | 命中判定で減算 |
| acc | 命中率補正(%) | 命中判定で加算。基本0 |
| statusRes | 状態異常耐性(%) | 状態異常成功率を軽減 |
| elemRes | 属性耐性(%) | 属性ごと。被属性ダメージ軽減 |
| sp / maxSp | SP | スキルコスト。初期最大10、毎ターン+2回復 |

- 行動力は独立ステータスとしては置かず、spd＝行動順として扱う（仮決定）。

### 5.2 属性
- MVP: 無 (none) / 火 (fire) / 水 (water) / 風 (wind) の4属性
- 相性: 火→風 有利、風→水 有利、水→火 有利（有利1.25倍 / 不利0.75倍 / 他1.0倍）。無は常に等倍
- 将来: 光 (light) / 闇 (dark) を相互有利で追加

### 5.3 状態異常（MVP 5種）
| コード | 名称 | 効果 | 継続 |
|---|---|---|---|
| poison | 毒 | ターン終了時 maxHpの8%ダメージ | 3ターン |
| burn | 火傷 | ターン終了時 maxHpの5%ダメージ + atk-10% | 2ターン |
| paralysis | 麻痺 | 30%で行動不能 | 2ターン |
| stun | スタン | 1回行動不能 | 1ターン |
| weaken | 弱体 | def-25% | 3ターン |

バフ/デバフ（別枠、重複は同種上書き・効果値大が優先）: atkUp/atkDown, defUp/defDown, spdUp/spdDown, critUp, regen（ターン終了時maxHp5%回復）。

### 5.4 計算式（初期バランス案・全設計書共通）
```
ダメージ = max(1, floor(atk × skillMult × (100 / (100 + def)) × elemMod × critMod × rand(0.90〜1.10)))
  skillMult: 通常攻撃1.0 / スキル0.8〜3.0
  elemMod: 1.25 / 1.0 / 0.75（さらに対象のelemResで最大-50%）
  critMod: クリ時 critDmg/100（基本1.5）、非クリ時1.0
クリティカル判定: rand100 < critRate（上限100）
命中判定: rand100 < clamp(95 + acc - eva, 50, 100)   ※外れたら「回避」
状態異常成功率 = 基本成功率 × (100 - statusRes) / 100
獲得EXP = Σ 敵のbaseExp × (1 + 0.10 × (floor - 1)) × difficultyExpMod
必要EXP: expToNext(L) = floor(20 × L^1.5)   ※ラン内レベル上限20、開始Lv1
レベルアップ成長: maxHp+8%, atk+5%, def+5%, spd+2%（キャラごとの成長率係数0.8〜1.2を乗算）+ 全回復なし（HP割合維持）+ スキル3択
敵ステータス: stat(floor) = base × (1 + 0.12 × (floor - 1)) × difficultyMod
敵種別補正: 通常×1.0 / 強敵 HP×1.5,ATK×1.15 / エリート HP×2.0,ATK×1.3 / ボス HP×4.0,ATK×1.5
難易度補正 difficultyMod: Normal 1.0（MVP唯一）/ 将来 Hard 1.3 / Nightmare 1.6（EXP・報酬も同率増加）
逃走成功率 = clamp(50 + (自spd - 敵最速spd) × 2, 20, 90)（ボス・エリート戦は逃走不可）
```

### 5.5 キャラクター（MVP 3体）
| code | 名前 | タイプ | 属性 | 初期値(HP/ATK/DEF/SPD/クリ率) | 固有能力 | 解放 |
|---|---|---|---|---|---|---|
| swordsman_rain | レイン | 剣士・バランス | 火 | 100/12/10/10/5% | 「不屈」: ラン中1回、致死ダメージをHP1で耐える | 初期解放 |
| mage_lilia | リリア | 魔導士・スキル攻撃 | 水 | 80/14/7/9/5% | 「魔力循環」: SP回復+1/ターン | ソウルシャード300で解放 |
| rogue_gald | ガルド | 盗賊・速攻クリ | 風 | 85/11/8/14/15% | 「先手必勝」: 戦闘1ターン目のダメージ+30% | 実績「累計ラン10回」で解放 |

- レアリティは導入しない（キャラは役割差別化のみ。仮決定、ガチャ非導入のため）

### 5.6 ダンジョン（MVP 1種）
- dungeons.code = `forgotten_ruins`「忘却の遺跡」/ 難易度 Normal のみ / 全10階層
- ノードマップ: 階層1〜10。各階層のノード数2〜4（階層1は1個=開始戦闘、階層10は1個=ボス）
- 分岐: 各ノードは次階層の1〜3ノードへ接続。パスは常にボスへ到達可能
- ノードタイプ（コード / 出現階層 / 出現重み はダンジョン設計書で詳細化）:
  BATTLE(通常戦闘) / STRONG(強敵) / ELITE(エリート) / BOSS / TREASURE(宝箱) / SHOP / REST(休憩) /
  EVENT(ランダムイベント) / BLESS(強化イベント) / HEAL(回復イベント) / CURSE(呪いイベント) /
  STORY(ストーリー) / SECRET(隠し部屋)
- 生成制御: 階層5と階層9にRESTを必ず1個以上 / SHOPはマップ全体で1〜2個 / ELITEは階層3以降 /
  同一タイプが同一パス上に3連続しない / SECRETは10%で出現しEVENT扱いの上位報酬
- シード: サーバー生成の32bit seed + PRNGカーソルをdungeon_runsに保存（再現性・検証用）
- 休憩ノード: 「HP50%回復」or「スキル1つ強化」の二択
- クリア判定: 階層10のボス撃破 / 敗北判定: 戦闘中HP0 / リタイア: 任意（敗北扱いだが獲得ソウルシャードは80%持ち帰り、敗北時は50%、クリア時100%+クリアボーナス）

### 5.7 敵（MVP: 通常5 / エリート2 / ボス1）
| code | 名前 | 種別 | 属性 | 特徴 |
|---|---|---|---|---|
| slime | スライム | 通常 | 水 | 低脅威。回復小技持ち |
| goblin | ゴブリン | 通常 | 無 | 標準アタッカー |
| bat | 洞窟コウモリ | 通常 | 風 | 高速・回避高・吸血 |
| skeleton | スケルトン | 通常 | 無 | 防御高・weaken付与 |
| fire_imp | 火の小鬼 | 通常 | 火 | burn付与 |
| orc_champion | オークチャンピオン | エリート | 無 | 2ターンごと強撃(予告あり) |
| dark_shaman | 闇のシャーマン | エリート | 水 | デバフ・仲間強化・召喚(スライム) |
| ruin_guardian | 遺跡の守護者 | ボス | 無 | 3フェーズ。HP50%以下で怒り(atk+30%)、フェーズ移行で全体攻撃予告 |

- 敵AI: 「重み付き行動テーブル + 条件ルール(優先評価)」方式。完全ランダム禁止。行動予告(intent)を全敵に表示

### 5.8 スキル（MVP 20種）/ レリック（10種）/ 装備（武器10種）
- スキルはマスタ駆動: skills(基本情報) + skill_effects(効果行: effect_type + params JSONB)
- effect_type 例: damage, damage_aoe, heal, buff, debuff, status, sp_gain, shield, revive_guard
- スキル3択: レベルアップ時に候補3件提示（レア度重み: common60/rare30/epic10）+ リロール1回/ラン（永続強化で+）
- スキル強化: 同一スキル再取得で強化Lv+1（最大3、倍率/効果値上昇）。所持上限8枠、削除はイベント/休憩で可
- レリック: trigger(always/battle_start/turn_start/turn_end/on_low_hp/on_kill/node_enter) + effect JSONB。同一レリック重複不可。呪い付き2種を含む
- 装備: equipmentマスタ（slot: weapon/armor/accessory 各1枠）。ラン内ドロップ+永続解放装備（初期装備候補）。レア度: common/rare/epic。ランダムオプションはMVPでは固定値のみ（仮決定、将来JSONBオプション）
- 個別マスタの具体表は各設計書（18_Skill_Design.md 等）で20/10/10件を必ず列挙する

### 5.9 通貨・永続成長
- ゴールド: ラン内のみ。ショップ購入・イベントで使用。ラン終了で消滅（永続強化「換金」で一部持ち帰り将来対応）
- ソウルシャード: 永続。リザルトで獲得（クリア100% / リタイア80% / 敗北50%）。キャラ解放・永続強化に使用
- プレイヤーランク: ランクEXPをリザルトで獲得。expToRank(R) = 100 × R^1.8。ランク上限は当面50
- 永続強化ツリー（upgrade_nodes, MVP 12ノード例）: 初期HP+5%×3段 / 初期ATK+3%×3段 / 初期ゴールド+50×2段 / 開始時レリック1個 / スキルリロール+1回 / ソウルシャード獲得+10%×2段
- バランス方針: 永続強化の総和はステータス+30%以内に制限（ラン内成長が主役）。詳細は 05_Game_Design.md

---

## 6. 画面一覧（画面IDは全設計書共通）

| SCR | 画面名 | 区分 | MVP |
|---|---|---|---|
| SCR-001 | スプラッシュ画面 | 共通 | ○ |
| SCR-002 | タイトル画面 | 共通 | ○ |
| SCR-003 | ログイン画面 | 認証 | ○ |
| SCR-004 | 新規登録画面 | 認証 | ○ |
| SCR-005 | ゲスト開始画面 | 認証 | ○ |
| SCR-006 | データ引き継ぎ画面 | 認証 | ○(ゲスト→正式のみ) |
| SCR-007 | 利用規約画面 | 共通 | ○ |
| SCR-008 | プライバシーポリシー画面 | 共通 | ○ |
| SCR-009 | メンテナンス画面 | 共通 | ○ |
| SCR-010 | 通信エラー画面 | 共通 | ○ |
| SCR-101 | ホーム画面 | ホーム | ○ |
| SCR-102 | プレイヤープロフィール画面 | ホーム | ○ |
| SCR-103 | 拠点画面 | ホーム | △(ホームに統合可) |
| SCR-104 | キャラクター一覧画面 | ホーム | ○ |
| SCR-105 | キャラクター詳細画面 | ホーム | ○ |
| SCR-106 | 永続強化画面 | ホーム | ○ |
| SCR-107 | 武器一覧画面 | ホーム | ○ |
| SCR-108 | スキル図鑑画面 | ホーム | ○ |
| SCR-109 | レリック図鑑画面 | ホーム | ○ |
| SCR-110 | 敵図鑑画面 | ホーム | ○ |
| SCR-111 | 実績一覧画面 | ホーム | ○ |
| SCR-112 | ミッション一覧画面 | ホーム | ×(将来) |
| SCR-113 | ショップ画面(拠点) | ホーム | ×(将来) |
| SCR-114 | 所持品画面 | ホーム | ×(将来) |
| SCR-115 | お知らせ画面 | ホーム | ○ |
| SCR-116 | 設定画面 | ホーム | ○ |
| SCR-117 | ヘルプ画面 | ホーム | ○ |
| SCR-118 | クレジット画面 | ホーム | ○ |
| SCR-201 | ダンジョン一覧画面 | 準備 | ○ |
| SCR-202 | ダンジョン詳細画面 | 準備 | ○ |
| SCR-203 | 難易度選択画面 | 準備 | △(詳細に統合) |
| SCR-204 | キャラクター選択画面 | 準備 | ○ |
| SCR-205 | 初期装備選択画面 | 準備 | ○ |
| SCR-206 | 初期能力選択画面 | 準備 | ×(将来) |
| SCR-207 | 出撃確認画面 | 準備 | ○ |
| SCR-301 | ダンジョンマップ画面 | ラン中 | ○ |
| SCR-302 | 戦闘画面 | ラン中 | ○ |
| SCR-303 | スキル選択画面(3択) | ラン中 | ○ |
| SCR-304 | レベルアップ画面 | ラン中 | ○(SCR-303と連続表示) |
| SCR-305 | 宝箱画面 | ラン中 | ○ |
| SCR-306 | ショップ画面(ダンジョン内) | ラン中 | ○ |
| SCR-307 | 休憩画面 | ラン中 | ○ |
| SCR-308 | イベント画面 | ラン中 | ○ |
| SCR-309 | 装備選択画面 | ラン中 | ○ |
| SCR-310 | レリック取得画面 | ラン中 | ○ |
| SCR-311 | ステータス確認画面 | ラン中 | ○ |
| SCR-312 | 所持品確認画面 | ラン中 | ○ |
| SCR-313 | 一時停止画面 | ラン中 | ○ |
| SCR-314 | リタイア確認画面 | ラン中 | ○ |
| SCR-401 | クリア画面 | 結果 | ○ |
| SCR-402 | 敗北画面 | 結果 | ○ |
| SCR-403 | リザルト画面 | 結果 | ○ |
| SCR-404 | 報酬獲得画面 | 結果 | ○(リザルトに統合可) |
| SCR-405 | 新規解放画面 | 結果 | ○ |
| SCR-406 | プレイヤーランクアップ画面 | 結果 | ○(演出モーダル) |
| SCR-407 | 実績解除画面 | 結果 | ○(トースト) |

詳細ワイヤーフレーム必須13画面: SCR-002, SCR-101, SCR-204, SCR-201, SCR-207, SCR-301, SCR-302, SCR-303, SCR-308, SCR-403, SCR-106, SCR-105, SCR-116

---

## 7. API一覧（ベースパス /api/v1、API IDは全設計書共通）

| API | 名称 | メソッド | エンドポイント | 認証 | MVP |
|---|---|---|---|---|---|
| API-001 | ユーザー登録 | POST | /auth/register | 不要 | ○ |
| API-002 | ログイン | POST | /auth/login | 不要 | ○ |
| API-003 | ログアウト | POST | /auth/logout | 要 | ○ |
| API-004 | 自分の情報取得 | GET | /auth/me | 要 | ○ |
| API-005 | ゲスト開始 | POST | /auth/guest | 不要 | ○ |
| API-006 | ゲスト引き継ぎ | POST | /auth/link | 要(ゲスト) | ○ |
| API-007 | パスワード再設定要求/確定 | POST | /auth/password-reset, /auth/password-reset/confirm | 不要 | △(将来。メール基盤要) |
| API-008 | 退会 | DELETE | /auth/account | 要 | ○ |
| API-101 | ホーム情報取得 | GET | /home | 要 | ○ |
| API-102 | プレイヤー情報取得 | GET | /player | 要 | ○ |
| API-103 | 所持通貨取得 | GET | /player/currencies | 要 | ○ |
| API-104 | お知らせ取得 | GET | /announcements | 不要 | ○ |
| API-105 | ミッション取得 | GET | /missions | 要 | ×(将来) |
| API-106 | 実績取得 | GET | /achievements | 要 | ○ |
| API-201 | キャラクター一覧取得 | GET | /characters | 要 | ○ |
| API-202 | キャラクター詳細取得 | GET | /characters/{characterId} | 要 | ○ |
| API-203 | キャラクター解放 | POST | /characters/{characterId}/unlock | 要 | ○ |
| API-204 | 永続強化実行 | POST | /player/upgrades | 要 | ○ |
| API-301 | ダンジョン一覧取得 | GET | /dungeons | 要 | ○ |
| API-302 | ダンジョン詳細取得 | GET | /dungeons/{dungeonId} | 要 | ○ |
| API-303 | ダンジョン開始 | POST | /runs | 要 | ○ |
| API-304 | 現在ラン取得(再開兼用) | GET | /runs/current | 要 | ○ |
| API-305 | 次ノード選択 | POST | /runs/current/select-node | 要 | ○ |
| API-306 | リタイア | POST | /runs/current/retire | 要 | ○ |
| API-307 | リザルト確定(クリア/敗北後の受領) | POST | /runs/current/finalize | 要 | ○ |
| API-401 | 戦闘状態取得 | GET | /runs/current/battle | 要 | ○ |
| API-402 | 行動実行(攻撃/スキル/防御/アイテム/逃走) | POST | /runs/current/battle/actions | 要 | ○ |
| API-501 | レベルアップ候補取得 | GET | /runs/current/level-up | 要 | ○ |
| API-502 | スキル選択(3択/リロール/スキップ) | POST | /runs/current/level-up/select | 要 | ○ |
| API-503 | 宝箱開封 | POST | /runs/current/treasure/open | 要 | ○ |
| API-504 | ショップ購入 | POST | /runs/current/shop/purchase | 要 | ○ |
| API-505 | 休憩実行 | POST | /runs/current/rest | 要 | ○ |
| API-506 | イベント選択 | POST | /runs/current/event/choose | 要 | ○ |
| API-507 | 装備変更(ラン内) | POST | /runs/current/equipment | 要 | ○ |
| API-508 | レリック取得確定 | POST | /runs/current/relic | 要 | ○ |
| API-601 | 図鑑取得 | GET | /codex | 要 | ○ |
| API-602 | 設定取得 | GET | /settings | 要 | ○ |
| API-603 | 設定更新 | PUT | /settings | 要 | ○ |
| API-604 | セーブデータ取得 | GET | /save | 要 | ○(API-304と統合可) |

補足（全API設計で厳守）:
- 戦闘開始APIは独立させない。API-305のノード選択で戦闘ノードに入るとサーバーが戦闘状態を生成して返す
- 戦闘終了・報酬計算・レベルアップ抽選・ドロップ抽選は全てサーバー側。API-402の応答に戦闘終了/報酬/獲得EXPを含める
- ラン系変更API（303,305,306,307,402,502〜508）は `Idempotency-Key` ヘッダ + run_state.version（楽観ロック）を必須とする
- レート制限: 認証系 5回/分/IP、その他 60回/分/ユーザー
- エラー共通形式: `{ errorCode, message, details, traceId, timestamp }`

### 主要エラーコード
ERR_AUTH_UNAUTHORIZED(401) / ERR_AUTH_INVALID_CREDENTIALS(401) / ERR_AUTH_SESSION_EXPIRED(401) /
ERR_AUTH_LOCKED(423) / ERR_FORBIDDEN(403) / ERR_VALIDATION(400) / ERR_NOT_FOUND(404) /
ERR_CONFLICT_VERSION(409, 楽観ロック競合) / ERR_DUPLICATE_REQUEST(409, 冪等キー重複) /
ERR_RUN_STATE_INVALID(409, ダンジョン状態不整合) / ERR_RUN_ALREADY_ACTIVE(409) /
ERR_INVALID_ACTION(422, 不正な行動) / ERR_REWARD_ALREADY_CLAIMED(409) / ERR_INSUFFICIENT_GOLD(422) /
ERR_INSUFFICIENT_SHARDS(422) / ERR_RATE_LIMITED(429) / ERR_MAINTENANCE(503) / ERR_TIMEOUT(504) /
ERR_INTERNAL(500)

---

## 8. テーブル一覧（DB設計・API設計・モジュール設計で共通）

### マスタデータ（master_data_versionsでバージョン管理、シードスクリプトで投入）
characters, equipment(DEC-017), skills, skill_effects, relics, enemies, enemy_actions, enemy_ai_rules,
dungeons, dungeon_difficulties, dungeon_node_types, random_events, random_event_choices,
reward_tables, upgrade_nodes, achievements, stories, master_data_versions
（将来: missions）

### ユーザー永続データ
users, user_profiles, user_settings, auth_sessions, password_reset_tokens(将来),
player_progress(ランク/EXP/統計), player_currencies, player_characters, player_equipment(永続解放装備),
player_upgrades, player_codex(DEC-018), player_achievements, player_story_progress,
currency_transactions(通貨増減ログ)
（将来: player_missions）

### ラン一時データ
dungeon_runs（run_state JSONB + version + seed + status: active/cleared/failed/retired/finalized）,
dungeon_run_snapshots（チェックポイント世代管理、直近3世代）,
battle_logs（戦闘ログ、保持30日）

### 運用
announcements, maintenance_settings, audit_logs

統合・不採用の判断（DB設計書に明記）:
- guest_accounts → usersにis_guest列で統合
- character_levels/character_unlock_conditions → charactersの列(JSONB growth/unlock_condition)に統合
- weapons/armors/accessories系6テーブル → equipment + player_equipmentに統合
- dungeon_run_nodes/characters/skills/equipment/relics/items/battles, battle_turns/actions → dungeon_runs.run_state JSONB + battle_logsに統合（1ランのデータは常に一括読み書きのため）
- dungeon_floors → dungeonsのgeneration_config JSONBに統合
- bosses → enemiesにenemy_type列(normal/strong/elite/boss)で統合
- rewards → reward_tablesに統合
- error_logs → テーブル化しない(DEC-020)
- sessions → auth_sessionsとして実装（Auth.js JWT戦略のためリフレッシュ/失効管理用の最小構成）

### run_state JSONB の構造（骨子・詳細は15_Save_Data_Design.md / 12_Database_Design.md）
```jsonc
{
  "schemaVersion": 1,
  "map": { "seed": 123456789, "floors": [...], "edges": [...] },
  "position": { "floor": 3, "nodeId": "f3n2", "phase": "node_action" }, // phase: map_select / node_action / battle / reward_pending
  "character": { "code": "swordsman_rain", "level": 5, "exp": 120, "stats": {...}, "hp": 74, "sp": 10 },
  "skills": [{ "code": "flame_slash", "level": 2 }],
  "equipment": { "weapon": "iron_sword", "armor": null, "accessory": null },
  "relics": ["lucky_coin"],
  "items": [{ "code": "potion", "count": 2 }],
  "gold": 230,
  "battle": { /* 戦闘中のみ。enemies, turnNo, actionQueue, rngCursor, effects */ },
  "pendingReward": { /* 未受領報酬。type + choices + claimed */ },
  "rngCursor": 42,
  "earned": { "soulShards": 35, "rankExp": 120, "kills": 12 }
}
```

---

## 9. モジュール一覧（11_Module_Design.md で詳細化、ディレクトリは src/ 配下）

AuthModule, UserModule, PlayerModule, CharacterModule, DungeonModule, DungeonGenerationModule,
BattleModule, EnemyAIModule, SkillModule, EquipmentModule, RelicModule, RewardModule, EventModule,
ProgressionModule, AchievementModule, MissionModule(将来), ShopModule, SaveModule, MasterDataModule,
NotificationModule, AdminModule(将来・土台のみ), LoggingModule, AntiCheatModule

レイヤ構成（31章ディレクトリ構成と一致させる）:
```
src/
  app/                  # Next.js App Router（画面 + /api/v1 route handlers）
  components/           # 汎用UIコンポーネント(shadcn/ui含む)
  features/<feature>/   # 画面単位のUIロジック(hooks, コンポーネント)
  domain/               # ★純粋ゲームロジック。Next.js/Prisma非依存。関数はここ
    battle/ dungeon/ skill/ enemy/ reward/ progression/ shared/
  server/
    usecases/           # APIごとのユースケース(トランザクション境界)
    repositories/       # Prismaアクセス(インターフェースはdomain側定義)
    services/           # 認証・レート制限・冪等性・ロギング
  lib/ hooks/ stores/ schemas/(Zod) types/ constants/ config/
prisma/ public/ tests/ docs/ scripts/
```

主要ゲームロジック関数（30章）は `src/domain/` に配置:
generateDungeonSeed, generateDungeonMap, selectNextNode, startDungeonRun, resumeDungeonRun,
startBattle, determineTurnOrder, calculateDamage, calculateCritical, calculateEvasion,
applyBuff, applyDebuff, applyStatusEffect, executePlayerAction, executeEnemyAction, selectEnemyAction,
checkBattleEnd, calculateBattleReward, gainExperience, levelUp, generateSkillChoices, selectSkill,
generateTreasureReward, generateShopItems, purchaseShopItem, executeRandomEvent,
completeDungeon, failDungeon, retireDungeon, grantPersistentRewards, saveRunProgress, validateRunState

---

## 10. 技術スタック（26章）

採用: Next.js(App Router) / TypeScript(strict) / React / Tailwind CSS / shadcn/ui / PostgreSQL(Neon) /
Prisma / Auth.js(NextAuth v5) / Zustand / TanStack Query / Zod / React Hook Form / Framer Motion /
Vitest / Playwright / Vercel / GitHub Actions / Dependabot

不採用(MVP): Canvas, PixiJS, Phaser, Three.js, Redux Toolkit, Supabase(Neon採用), IndexedDB(将来PWAで検討)
LocalStorage: 設定・音量・チュートリアルフラグ等の非重要データのみ。ゲーム進行データは必ずサーバー保存

---

## 11. MVP範囲（35章・全書共通の前提）

含む: キャラ3体 / ダンジョン1種(忘却の遺跡) / 難易度Normalのみ / 10階層 / 通常敵5・エリート2・ボス1 /
スキル20 / レリック10 / 武器10(装備は武器のみドロップ、防具・アクセは種類を絞り各3程度) /
ランダムイベント10 / ターン制戦闘 / ノード型マップ / スキル3択 / 途中保存・再開 / クリアと敗北 /
永続強化(12ノード) / ユーザー登録+ゲスト / 実績(10個) / 図鑑 / スマホ+PC対応 / Vercel+Neon

除外(将来): PvP / ギルド / チャット / シーズン / リアルタイムマルチ / ガチャ / 課金 / ランキング /
管理画面UI / 3D / ボイス / BGM(効果音は最小限△) / 複雑アニメ / ネイティブアプリ / PWA(準備のみ) /
デイリー・ウィークリー / エンドレス / タイムアタック / ボスラッシュ / 高難易度 / チャレンジ / 固定シード共有 /
ミッション / Google・GitHub・Appleログイン / パスワード再設定(メール基盤が要るため将来へ)

---

## 12. 非機能目標値（04章で詳細化、数値は共通）

初期表示3秒以内(LCP, 4G) / 操作応答1秒以内 / API p95 500ms以内(戦闘系は800ms以内許容) /
月間稼働率99.5%目標(個人開発のため99.9%は将来目標) / DBバックアップ日次(Neon PITR 7日) /
認証APIレート制限5回/分/IP / ログイン試行5回失敗で15分ロック / セッション有効期限: アクセストークン24h・最大30日 /
APIタイムアウト10s(Vercel関数上限内) / 全入力Zodでサーバー側検証 / 戦闘結果はサーバー権威(DEC-007)

---

## 13. 各設計書の共通フォーマット規則

1. 言語: 日本語。コード・識別子は英語
2. 冒頭にタイトル、目的、関連文書
3. 仮決定事項には「（仮決定）」と明記し、可能ならDEC-NNNを引用
4. 末尾に必ず3セクション: 「## 未決事項」「## 実装時の注意点」「## 関連設計書」
5. Mermaidは ```mermaid フェンスで記述し、構文エラーがないこと（ノードIDに日本語・記号を使わずラベルで日本語表記）
6. 「詳細は後述」で逃げない。具体例・具体値を必ず記載
7. 画面はSCR-NNN、APIはAPI-NNN、テーブルはsnake_caseで本仕様と完全一致させる
