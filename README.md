# Rogue Chronicle

挑戦するたびに構造・イベント・敵・報酬が変化するダンジョンへ挑む、ブラウザ/スマートフォン対応のローグライトRPG。
敗北してもプレイヤーランク・図鑑・永続強化などの「記録（クロニクル）」は残り、次の挑戦を強くします。

- 1ラン 15〜30分 / ターン制コマンドバトル / ノード選択型マップ（全10階層）
- 戦闘結果・報酬は全てサーバー側で計算（チート耐性のためのサーバー権威設計）

## 技術スタック

Next.js (App Router) / TypeScript / React / Tailwind CSS / Prisma / PostgreSQL (Neon) /
Auth.js / TanStack Query / Zustand / Zod / Framer Motion / Vitest / Playwright / Vercel

選定理由と代替案は [docs/10_System_Architecture.md](./docs/10_System_Architecture.md) と
[docs/29_Decision_Log.md](./docs/29_Decision_Log.md) を参照。

## セットアップ

```bash
nvm use            # Node 22 LTS（.nvmrc）
corepack enable    # pnpm を有効化
pnpm install       # postinstall で prisma generate が走る

cp .env.example .env.local   # DATABASE_URL 等を設定（Neon接続文字列）
pnpm db:migrate              # マイグレーション（Phase 3以降）
pnpm dev                     # http://localhost:3000
```

## 開発コマンド

| コマンド                           | 内容                            |
| ---------------------------------- | ------------------------------- |
| `pnpm dev`                         | 開発サーバー起動                |
| `pnpm lint` / `pnpm format`        | ESLint / Prettier               |
| `pnpm typecheck`                   | TypeScript型検査                |
| `pnpm test`                        | 単体テスト（Vitest）            |
| `pnpm e2e`                         | E2Eテスト（Playwright）         |
| `pnpm build`                       | 本番ビルド                      |
| `pnpm db:migrate` / `pnpm db:seed` | DBマイグレーション / マスタ投入 |

## ディレクトリ構成（概要）

```
src/
  app/        # Next.js App Router（画面 + /api/v1 Route Handlers）
  components/ # 汎用UIコンポーネント
  features/   # 画面単位のUIロジック
  domain/     # 純粋ゲームロジック（Next.js/Prisma非依存・乱数はRng注入）
  server/     # usecases（Tx境界）/ repositories（Prisma）/ services
  lib/ hooks/ stores/ schemas/ types/ constants/ config/
prisma/       # スキーマ・マイグレーション・シード
tests/e2e/    # Playwright E2E
docs/         # 設計書一式（実装は設計書を正とする）
```

依存方向は `app → features → server → domain`。domain層のフレームワーク非依存はESLintで強制しています。

## ドキュメント

設計書は [docs/](./docs/) 配下（00〜29 + CORE_SPEC）。入口は
[docs/00_Project_Overview.md](./docs/00_Project_Overview.md)。
設計変更時は [docs/29_Decision_Log.md](./docs/29_Decision_Log.md) への追記が必須です。

## 開発フェーズ

ロードマップは [docs/27_Roadmap.md](./docs/27_Roadmap.md)。現在: **Phase 1（プロジェクト初期構築）**。

## License

MIT
