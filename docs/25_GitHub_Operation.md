# 25. GitHub運用設計書 — Rogue Chronicle

## 目的

本書は Rogue Chronicle のリポジトリ運用（リポジトリ設定・ブランチ戦略・コミット規約・PR/Issue運用・CI/CD・依存管理・プロジェクト管理・リリースタグ）を定義する。個人開発 + AI協働を前提に、儀式を最小化しつつ履歴の追跡性と本番安全性を確保する。

## 関連文書

- CORE_SPEC（設計共通仕様）
- 24_Development_Guideline.md（開発ガイドライン）
- 26_Release_Plan.md（リリース計画）
- 27_Roadmap.md（開発ロードマップ）

---

## 1. リポジトリ設定

### 1.1 リポジトリ名候補

| 候補 | 評価 |
|---|---|
| **rogue-chronicle**（推奨・仮決定 DEC-250） | アプリ名（DEC-001）と完全一致。最短で検索性が高い。モノレポ化しても違和感なし |
| rogue-chronicle-app | アプリ本体であることが明示的。将来 `rogue-chronicle-docs` 等を分ける場合に整合的だが、当面その予定はなく冗長 |
| rogue-chronicle-game | ゲームであることが明示的。ただし名前から自明であり冗長 |

採用: **rogue-chronicle**（仮決定 DEC-250）。

### 1.2 説明文（About）案

> ブラウザで遊べるローグライトRPG。ラン型ダンジョン攻略×永続成長。Next.js + TypeScript + Prisma + Neon / Vercel。

英語版（公開時用）:

> A browser-based roguelite RPG with run-based dungeon crawling and permanent progression. Built with Next.js, TypeScript, Prisma, and Neon on Vercel.

Topics（公開時に設定）: `nextjs` `typescript` `prisma` `postgresql` `roguelite` `game` `vercel`

### 1.3 可視性: Private 推奨（仮決定 DEC-251）

**初期は Private とする。** 理由:

1. **個人開発初期**: 設計・実装が流動的で、未完成コードや設計ミスを晒すメリットがない。Vercel Git連携・GitHub Actions・Dependabot は Private でも利用可能（Actions は Free プランで Private 2,000分/月。本プロジェクトのCI規模なら十分）
2. **マスタデータ露出防止**: スキル倍率・敵AIテーブル・報酬抽選重み（reward_tables）がシードスクリプトとして平文で含まれる。公開するとゲームバランスの解析・攻略の陳腐化・不正の手がかりになる
3. ライセンス・クレジット表記（フォント・アイコン素材）の整理が済むまで法的確認を保留できる

**公開（Public化）を検討してよい条件**（全て満たした時）:

- [ ] 正式公開（26_Release_Plan.md §7 のβ→正式移行）が完了し、コードの恥ずかしさより宣伝価値が上回った
- [ ] 秘密値の履歴混入がないことを確認済み（`gitleaks` 等でフルスキャン。混入があれば履歴書き換えではなく**鍵ローテーション**で対処）
- [ ] マスタデータの扱いを決めた（a. そのまま公開しバランスはオープン、b. シード実データを private submodule / 手元スクリプトに分離）
- [ ] LICENSE と第三者素材のライセンス表記を整備した

### 1.4 リポジトリ基本設定

| 設定 | 値 |
|---|---|
| Default branch | `main` |
| Merge button | **Squash merge のみ有効**（Merge commit / Rebase merge は無効化） |
| Automatically delete head branches | ON |
| Branch protection (main) | PR必須 / CI（`ci`）ステータス必須 / 直push禁止（自分含む）。個人開発のため approval 必須は設定しない（仮決定 DEC-252） |
| Branch protection (develop) | CIステータス必須のみ（緊急時の直pushは許容） |
| Issues / Projects | ON |
| Wiki / Discussions | OFF（ドキュメントは docs/ に一元化） |

---

## 2. リポジトリ初期ファイル

### 2.1 README 構成（目次案）

```markdown
# Rogue Chronicle

ブラウザで遊べるローグライトRPG（開発中）

## 概要
（1段落: ゲームコンセプト、1ラン15〜30分、永続成長）

## スクリーンショット
（β公開後に3枚: ホーム / ダンジョンマップ / 戦闘。それまでは「準備中」）

## 技術スタック
（Next.js App Router / TypeScript / Tailwind + shadcn/ui / Prisma / Neon / Auth.js /
 Zustand / TanStack Query / Vitest / Playwright / Vercel — CORE_SPEC §10 と一致させる）

## セットアップ
（docs/24_Development_Guideline.md §5.2 への参照 + 最小コマンド5行）

## 開発コマンド
（pnpm dev / lint / typecheck / test / db:seed の表）

## ドキュメント一覧
（docs/ 配下の設計書一覧テーブル: 番号・ファイル名・内容1行）

## ライセンス
（Private運用中は「All rights reserved（検討中）」）
```

### 2.2 LICENSE

- **当面 LICENSE ファイルは置かない**（Private のため不要。無記載 = All rights reserved）
- 公開時に **MIT を第一候補**として検討（仮決定 DEC-253）。ただし §1.3 のマスタデータ分離判断とセットで決める。コード=MIT / ゲームデータ・アセット=非OSS の二分割ライセンスも選択肢

### 2.3 .gitignore（Next.js 標準 + 追加）

```gitignore
# dependencies
/node_modules
.pnp
.pnp.*

# next.js
/.next/
/out/
next-env.d.ts

# production
/build

# testing
/coverage
/playwright-report/
/test-results/

# env — .env* を全て無視し、exampleのみ許可
.env*
!.env.example

# vercel
.vercel

# prisma
prisma/*.db

# misc
.DS_Store
*.pem
*.log
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

# typescript
*.tsbuildinfo
```

### 2.4 .env.example

24_Development_Guideline.md §5.1 に全項目を定義済み。同内容をリポジトリ直下に `.env.example` としてコミットする（実値は絶対に含めない）。

---

## 3. ブランチ戦略

### 3.1 方針: main + develop の簡易型（GitHub Flow 寄り、仮決定 DEC-254）

個人開発に git-flow はオーバーヘッド過剰。**release ブランチ・hotfix ブランチは設けない**（release不要論: リリース=mainへのマージそのものであり、リリース準備作業を隔離する共同作業者が存在しないため。緊急修正は `fix/xxx` → develop → main の最短経路、または main 直 cherry-pick で足りる）。

| ブランチ | 役割 | デプロイ先 | 寿命 |
|---|---|---|---|
| `main` | 本番。常にリリース可能 | Vercel **Production** | 永続 |
| `develop` | 統合。次リリースの内容 | Vercel **Preview**（固定エイリアス） | 永続 |
| `feature/xxx` | 機能開発（例: `feature/battle-damage-calc`） | Vercel Preview（PRごと自動） | PRマージで削除 |
| `fix/xxx` | バグ修正（例: `fix/run-version-conflict`） | 同上 | 同上 |

ルール:

- `feature/fix` は **develop から分岐し develop へ PR**。ブランチ名は kebab-case、対応 Issue があれば `feature/42-skill-choices` のように番号を含めてよい
- develop → main の PR が「リリースPR」（手順は 26_Release_Plan.md §6）
- マージは**必ず PR 経由・squash merge**（DEC-255）。squash 採用理由: AI協働で細かいWIPコミットが増えるため、main/develop の履歴を「1機能=1コミット」に保つ
- squash 時のコミットメッセージは PR タイトル（Conventional Commits 形式）をそのまま使う
- develop → main のリリースPRのみ、squash せず **merge commit を許可したい場合**があるが、運用単純化のため squash で統一し、リリース内容はタグ + CHANGELOG で追跡する（仮決定 DEC-256）

### 3.2 ブランチフロー図

```mermaid
flowchart LR
  F1[feature/battle-ui] -->|PR + squash| D[develop]
  F2[fix/hp-display] -->|PR + squash| D
  D -->|リリースPR + squash| M[main]
  M -->|tag v0.x.y| R[Release]
  D -.->|Vercel Preview| PV[プレビュー環境]
  M -.->|Vercel Production| PR2[本番環境]
```

---

## 4. コミット規約（Conventional Commits）

### 4.1 形式

```
<type>(<scope>): <日本語の要約（50字以内・句点なし）>

<本文（任意）: 変更理由・影響範囲>

<フッター（任意）: Closes #NN / BREAKING CHANGE: ...>
```

| type | 用途 |
|---|---|
| feat | 機能追加 |
| fix | バグ修正 |
| docs | ドキュメントのみ（docs/・README・CLAUDE.md） |
| refactor | 挙動を変えないコード整理 |
| test | テスト追加・修正のみ |
| chore | ビルド設定・依存更新・CI・シード等の雑務 |

scope 例（モジュール・領域名。CORE_SPEC §9 に対応）: `auth` `player` `character` `dungeon` `dungeon-gen` `battle` `enemy-ai` `skill` `equipment` `relic` `reward` `event` `progression` `achievement` `save` `master-data` `ui` `db` `api` `ci` `deps`

### 4.2 コミット例10個

```
feat(battle): ダメージ計算関数calculateDamageを実装
feat(dungeon-gen): シード付きノードマップ生成を実装（階層5,9にREST保証）
feat(auth): ゲスト開始API(API-005)とCookieセッション発行を追加
fix(battle): 麻痺の行動不能判定が毎ターン再抽選されない問題を修正
fix(save): run_state保存時のversion競合でERR_CONFLICT_VERSIONを返すよう修正
docs(roadmap): Phase 6の完了条件に戦闘E2Eフローを追記
refactor(skill): スキル3択の重み抽選をdomain/skill/generate-skill-choices.tsへ分離
test(reward): リザルト報酬のソウルシャード係数(100/80/50%)のTC-041〜044を追加
chore(deps): prisma 6.x へ更新しmigrate diffを確認
chore(ci): ci.ymlにtypecheckジョブとpnpmキャッシュを追加
```

### 4.3 運用ルール

- 1コミット=1関心事。「ついで修正」は分ける（squash 前提でも develop 上のレビューしやすさのため）
- `BREAKING CHANGE:` フッターは DB スキーマ・API の後方非互換変更に必ず付け、26_Release_Plan.md §6.4 の互換ルール確認をリリースPRで行う
- コミットメッセージ本文は日本語可（type/scope は英語固定）

---

## 5. PR テンプレート・Issue テンプレート

### 5.1 `.github/pull_request_template.md`（全文）

```markdown
## 概要
<!-- 何を・なぜ。1〜3行 -->

## 関連
- Issue: Closes #
- フェーズ: Phase N（docs/27_Roadmap.md）
- 参照設計書: docs/

## 変更内容
<!-- 箇条書き -->
-

## 確認方法
<!-- レビュアー（未来の自分）が動作確認する手順 -->
1.

## チェックリスト（docs/24 §7）
- [ ] CI green（lint / typecheck / test / build）
- [ ] domain層にNext.js/Prisma/Reactのimportなし
- [ ] 外部入力はZodでパース済み
- [ ] 秘密値の混入なし
- [ ] DBスキーマ変更なし、または後方互換（docs/26 §6.4）
- [ ] CORE_SPECの用語・ID・数式と一致
- [ ] スマホ幅(375px)で表示確認（UI変更時）

## スクリーンショット（UI変更時）
```

### 5.2 `.github/ISSUE_TEMPLATE/bug_report.yml`（全文）

```yaml
name: バグ報告
description: 不具合の報告
title: "[Bug] "
labels: ["bug"]
body:
  - type: textarea
    id: summary
    attributes:
      label: 概要
      description: 何が起きたか1〜2行で
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: 再現手順
      placeholder: |
        1. ゲストでログイン
        2. 忘却の遺跡でランを開始
        3. 階層3の戦闘でスキルを使用
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期待する挙動
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: 実際の挙動
      description: エラー表示があれば traceId も記載
    validations:
      required: true
  - type: dropdown
    id: env
    attributes:
      label: 発生環境
      options: [local, Preview(develop), Production]
    validations:
      required: true
  - type: input
    id: device
    attributes:
      label: 端末・ブラウザ
      placeholder: "iPhone 15 Safari / Windows Chrome 126"
  - type: dropdown
    id: severity
    attributes:
      label: 深刻度
      options:
        - "S1: 進行不能・データ破損"
        - "S2: 主要機能が使えない"
        - "S3: 回避策あり"
        - "S4: 表示崩れ・軽微"
    validations:
      required: true
```

### 5.3 `.github/ISSUE_TEMPLATE/feature_request.yml`（全文）

```yaml
name: 機能要望・タスク
description: 新機能・改善・実装タスク
title: "[Feat] "
labels: ["enhancement"]
body:
  - type: textarea
    id: purpose
    attributes:
      label: 目的・背景
      description: なぜ必要か
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: 実装内容
      description: 何を作るか。参照する設計書（docs/NN §M）を必ず記載
    validations:
      required: true
  - type: textarea
    id: done
    attributes:
      label: 完了条件
      description: 検証可能な形で（テストが通る／画面で〜できる）
    validations:
      required: true
  - type: input
    id: phase
    attributes:
      label: フェーズ
      placeholder: "Phase 6（docs/27_Roadmap.md）"
    validations:
      required: true
  - type: dropdown
    id: priority
    attributes:
      label: 優先度
      options: ["P1: MVP必須", "P2: MVP内で調整可", "P3: 将来"]
    validations:
      required: true
```

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: true
```

---

## 6. GitHub Actions（CI/CD）

### 6.1 `.github/workflows/ci.yml`（全文）

```yaml
name: ci

on:
  push:
    branches: [main, develop]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  # CIビルド用ダミー値（src/config/env.tsのZod検証を通すため。実DBには接続しない）
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/rogue_chronicle_test"
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/rogue_chronicle_test"
  AUTH_SECRET: "ci-dummy-secret-not-used-in-production"
  AUTH_TRUST_HOST: "true"
  NEXT_PUBLIC_APP_URL: "http://localhost:3000"

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: rogue_chronicle_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        # バージョンはpackage.jsonのpackageManagerフィールドから自動解決

      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"   # 22 (LTS)
          cache: "pnpm"                 # pnpm storeをキャッシュ

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Prisma generate & migrate (test DB)
        run: |
          pnpm prisma generate
          pnpm prisma migrate deploy

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          # Next.jsビルドキャッシュ
          NEXT_TELEMETRY_DISABLED: "1"

      - name: Cache Next.js build
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
          restore-keys: |
            nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
```

ポイント:

- Node バージョンは `.nvmrc`（22 LTS）を単一情報源とし、ローカル・CI・Vercel設定で一致させる
- ジョブは1本に直列化（Free枠節約 + 15分以内）。将来遅くなったら lint/typecheck と test/build を並列分割
- `main` / `develop` の branch protection で本ワークフロー（`ci`）を required check に設定

### 6.2 デプロイ: Vercel Git 連携（Actions からはデプロイしない）

- **デプロイは Vercel の GitHub 連携に一任**し、GitHub Actions からのデプロイは行わない。理由: Vercel 連携は PR ごとの Preview URL 自動発行・Instant Rollback・環境変数管理が組み込みで、Actions で再実装する価値がない
- 整理:

| トリガー | GitHub Actions | Vercel |
|---|---|---|
| PR 作成・更新 | ci.yml（品質ゲート） | Preview デプロイ（PR URL） |
| develop へ push | ci.yml | Preview デプロイ（develop 固定エイリアス） |
| main へ push | ci.yml | **Production デプロイ** |

- Vercel 側の "Ignored Build Step" は使わず全 push でビルド（docs のみの変更をスキップしたくなったら導入検討）
- CI が red でも Vercel は独立してデプロイしてしまうため、**main の branch protection（CI required）でマージ自体を止める**ことが品質ゲートの実体である点に注意

### 6.3 DBマイグレーションの実行タイミング（仮決定 DEC-257）

- **Vercel ビルド時に `prisma migrate deploy` を実行**する（仮決定 DEC-257）。`package.json` の build を `prisma generate && prisma migrate deploy && next build` とし、Vercel の環境変数 `DIRECT_URL` を使ってマイグレーションする
- 注意点（必読）:
  1. **Preview と Production で接続先DBが異なる**（26_Release_Plan.md §2 の Neon ブランチ構成）。Vercel の環境変数を環境スコープ（Production / Preview）で正しく分けないと本番DBに Preview のマイグレーションが走る事故になる
  2. ビルドは成功したがデプロイが失敗した場合、**DBだけ新しくコードが古い**状態になり得る → マイグレーションは常に後方互換（26_Release_Plan.md §6.4）にすることで無害化する
  3. 複数ビルドの同時実行で migrate が競合し得る（Prisma はアドバイザリロックで直列化するが失敗はあり得る）→ リリースPRのマージは1件ずつ行う
  4. ロールバック（Instant Rollback）はコードのみ戻る。DBは戻らない前提で運用する（後方互換ルールがここでも効く）
  5. 将来、事故リスクが顕在化したら「Actions で migrate → 成功後に Vercel Deploy Hook を叩く」方式へ移行する（ISSUE-252）

### 6.4 将来のワークフロー

- **E2E nightly**（Phase 11 以降）: `.github/workflows/e2e-nightly.yml` を追加。`schedule: cron "0 18 * * *"`（JST 3時）で develop の Preview 環境に対して Playwright の主要3フローを実行し、失敗時は Issue 自動起票。PR ごとの E2E は遅いため nightly + リリース前手動実行に限定
- Lighthouse CI（リリース判定用、26_Release_Plan.md §5）は手動実行 workflow_dispatch で用意

---

## 7. Dependabot 設定

`.github/dependabot.yml`（全文）:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "saturday"   # 週末開発の直前にまとめて処理
      time: "09:00"
      timezone: "Asia/Tokyo"
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]   # minor/patchは1PRに集約
    labels: ["deps"]
    commit-message:
      prefix: "chore(deps)"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "saturday"
      timezone: "Asia/Tokyo"
    labels: ["deps"]
    commit-message:
      prefix: "chore(ci)"
```

運用: minor/patch グループPRは CI green を確認して squash マージ。major は個別PRになるため、リリースノートを確認してから手動対応（特に Next.js / Prisma / Auth.js の major は Phase 区切りでのみ上げる）。

---

## 8. Secret 管理（GitHub Secrets / Vercel 環境変数の分担）

原則: **アプリ実行時の秘密値は Vercel 環境変数、CI専用の値のみ GitHub Secrets**。二重管理をしない。

| 変数 | GitHub Secrets | Vercel (Production) | Vercel (Preview) | ローカル .env.local |
|---|---|---|---|---|
| DATABASE_URL | ×（CIはservice containerのダミー） | ○ Neon main（pooler） | ○ Neon develop ブランチ（pooler） | ○ Docker or Neon devブランチ |
| DIRECT_URL | × | ○ Neon main（direct） | ○ Neon develop（direct） | ○ |
| AUTH_SECRET | ×（CIはダミー平文でよい） | ○（本番専用値） | ○（Preview専用値。**本番と別の値**） | ○（ローカル専用値） |
| NEXT_PUBLIC_APP_URL | ×（ダミー） | ○ 本番URL | ○ develop エイリアスURL | ○ http://localhost:3000 |
| MAINTENANCE_MODE / LOG_LEVEL | × | ○ | ○ | ○ |
| SEED_ALLOW_PRODUCTION | × | ○（通常 false） | ○ | ○ |
| （将来）SENTRY_DSN 等 | × | ○ | ○ | △ |
| （将来）NEON_API_KEY（PRごとDBブランチ自動作成を導入する場合） | ○ | × | × | × |

ルール:

- AUTH_SECRET は環境ごとに別値（漏洩時の影響分離、環境間のセッション混入防止）
- 秘密値をコード・ログ・PR本文・Issue に書かない。誤コミットした場合は**即ローテーション**（履歴削除は行っても信用しない）
- GitHub Secrets は現時点で必須項目なし（CIがダミー値で完結する構成を維持することが望ましい）

---

## 9. GitHub Projects（かんばん）と Issue 駆動開発

- リポジトリに Project（Board形式）を1つ作成: **「Rogue Chronicle 開発」**
- 列: `Backlog` → `Todo` → `In Progress` → `Done`
  - Backlog: 全タスク置き場（フェーズ未着手分も含む）
  - Todo: 現在のフェーズで着手予定のもののみ（常時 10 件以内に保つ）
  - In Progress: **同時 2 件まで**（個人開発の並行作業抑制）
  - Done: マージ・完了（自動アーカイブ 2 週間）
- ラベル体系:

| ラベル | 用途 |
|---|---|
| `phase:0` 〜 `phase:14` | 27_Roadmap.md のフェーズ対応（色はフェーズ順のグラデーション） |
| `bug` / `enhancement` / `docs` / `deps` | 種別 |
| `P1` / `P2` / `P3` | 優先度（Issueテンプレートと対応） |
| `blocked` | 依存待ち |
| `balance` | ゲームバランス調整（実装と区別） |

- **Issue 駆動**: Phase 開始時にそのフェーズのタスクを Issue 化（feature テンプレート使用、完了条件必須）→ Todo へ → ブランチ作成 → PR に `Closes #NN` → マージで自動クローズ・自動 Done
- 設計変更が生じた場合も Issue を立て、docs/ の該当設計書更新を同一 PR に含める

---

## 10. タグ・Release・CHANGELOG

### 10.1 バージョニング（v0.x semver）

- 形式: `vMAJOR.MINOR.PATCH`。正式公開まで `v0.x` 系を使う
  - `v0.1.0`: 最初の Vercel 本番デプロイ（Phase 12 完了、β公開）
  - MINOR: フェーズ完了・機能追加のリリース
  - PATCH: バグ修正のみのリリース
  - `v1.0.0`: 正式公開（26_Release_Plan.md §7 の判定通過時）
- タグは main へのリリースPRマージ後に打つ:

```bash
git checkout main && git pull
git tag -a v0.3.0 -m "v0.3.0: 戦闘システム一式"
git push origin v0.3.0
```

- GitHub Release をタグごとに作成（Release notes は CHANGELOG の該当節を転記 + Generate release notes 併用）

### 10.2 CHANGELOG（Keep a Changelog 形式）

リポジトリ直下 `CHANGELOG.md`。形式は [Keep a Changelog 1.1.0] に従う:

```markdown
# Changelog

All notable changes to this project will be documented in this file.
形式は Keep a Changelog、バージョニングは Semantic Versioning (v0.x) に従う。

## [Unreleased]

## [0.2.0] - 2026-08-30
### Added
- ダンジョンマップ生成（シード付き、階層1〜10）
- ノード選択API (API-305)
### Fixed
- ゲストセッションが24時間で失効する問題
### Changed
- 休憩ノードの回復量を50%に調整（バランス）

## [0.1.0] - 2026-08-01
### Added
- 初回リリース（β公開）
```

- 節は `Added / Changed / Deprecated / Removed / Fixed / Security` のみ使用
- リリースPRの必須作業: `[Unreleased]` の内容を新バージョン節へ移動

---

## 11. 初回セットアップコマンド一式（手順書）

**以下は手順書であり、本設計書作成時点では実行しない。** Phase 1（初期構築）の冒頭で人間が実行する。

```bash
# 0. 前提: Node 22 LTS / corepack / gh CLI ログイン済み（gh auth login）

# 1. Next.jsプロジェクト作成（ローカル）
pnpm create next-app@latest rogue-chronicle \
  --typescript --eslint --tailwind --app --src-dir \
  --import-alias "@/*" --use-pnpm
cd rogue-chronicle

# 2. .nvmrc とpackageManager固定
echo "22" > .nvmrc
# package.json に "packageManager": "pnpm@9.x.x" が入っていることを確認

# 3. 追加の初期ファイル配置
#    - .gitignore を本書 §2.3 の内容に更新（.env* 除外を必ず確認）
#    - .env.example（docs/24 §5.1）
#    - .github/pull_request_template.md（§5.1）
#    - .github/ISSUE_TEMPLATE/bug_report.yml, feature_request.yml, config.yml（§5.2-5.3）
#    - .github/workflows/ci.yml（§6.1）
#    - .github/dependabot.yml（§7）
#    - CHANGELOG.md（§10.2 の骨子）
#    - docs/ ディレクトリ（設計書一式をコピー）

# 4. git 初期化と初回コミット
#    ※ create-next-app が git init 済みの場合は init を省略
git init
git add -A
git commit -m "chore: create-next-appによる初期構築とリポジトリ初期ファイル"

# 5. developブランチ作成
git branch develop

# 6. GitHubリポジトリ作成（gh CLI。Web UIでも可）
gh repo create rogue-chronicle --private \
  --description "ブラウザで遊べるローグライトRPG。Next.js + TypeScript + Prisma + Neon / Vercel" \
  --source . --remote origin

# 7. push
git push -u origin main
git push -u origin develop

# 8. リポジトリ設定（Web UI または gh api）
#    - Settings > General: Squash mergeのみ有効化 / Auto-delete head branches ON
#    - Settings > Branches: main保護（PR必須 + required check "ci"）、develop保護（required check "ci"）
#    - デフォルトブランチは main のまま
gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge

# 9. ラベル作成（例）
gh label create "phase:1" --color "1D76DB" --description "Phase 1: 初期構築"
gh label create "P1" --color "B60205" --description "MVP必須"
gh label create "balance" --color "FBCA04" --description "ゲームバランス調整"
# （phase:0〜14, P2, P3, blocked, deps を同様に作成）

# 10. Project作成（Web UIで Board「Rogue Chronicle 開発」、列 Backlog/Todo/In Progress/Done）

# 11. Vercel / Neon 連携は docs/26_Release_Plan.md §3-4 の手順で実施
```

---

## 未決事項

| ID | 内容 | 期限目安 |
|---|---|---|
| ISSUE-250 | 公開（Public化）時のマスタデータ分離方式（そのまま公開 or シード分離） | 正式公開判断時 |
| ISSUE-251 | develop の Vercel 固定エイリアス URL 命名（`develop-rogue-chronicle.vercel.app` 等） | Phase 12 |
| ISSUE-252 | マイグレーションを Actions 実行 + Deploy Hook 方式へ移行する条件（DEC-257 の見直し） | β公開後、事故または不安が生じた時 |
| ISSUE-253 | PR ごとの Neon DBブランチ自動作成（neondatabase/create-branch-action）導入の要否 | Phase 11 |
| ISSUE-254 | E2E nightly の失敗通知先（Issue起票のみ or メール通知追加） | Phase 11 |

## 実装時の注意点

- `.gitignore` の `.env*` + `!.env.example` は**初回コミット前**に必ず確認する。一度でも秘密値を push したらローテーション必須（履歴書き換えでは安全にならない）
- branch protection の required check 名はワークフローの `name`（`ci`）ではなく**ジョブ名**で判定される場合がある。設定後にダミーPRで実際にブロックされることを確認する
- Vercel は CI と無関係にデプロイする（§6.2）。「CI が守るのはマージ」であり「デプロイは main の状態に追従するだけ」というモデルを忘れない
- squash merge 運用では feature ブランチを develop に追従させる際 rebase ではなく merge を使う（squash 済みコミットの重複 conflict を避けるため、長寿命ブランチを作らないことが最善）
- Dependabot の major 更新 PR は Preview デプロイの動作確認まで行ってからマージする（特に Auth.js v5 系はセッション互換に注意）

## 関連設計書

- CORE_SPEC（設計共通仕様）— 技術スタック・ID体系
- 24_Development_Guideline.md — コーディング規約・レビュー観点・環境変数定義
- 26_Release_Plan.md — 環境構成・Vercel/Neonセットアップ・リリース手順・マイグレーション互換ルール
- 27_Roadmap.md — フェーズ定義（ラベル・マイルストーンの根拠）
