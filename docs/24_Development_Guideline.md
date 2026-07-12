# 24. 開発ガイドライン — Rogue Chronicle

## 目的

本書は Rogue Chronicle の実装フェーズ全体で適用するコーディング規約・アーキテクチャ規則・エラーハンドリング規約・環境構築手順・レビュー観点を定義する。個人開発かつ AI（Claude Code）との協働を前提に、「迷ったらこの文書に従う」単一の判断基準を提供する。

## 関連文書

- CORE_SPEC（設計共通仕様）
- 10_System_Architecture.md（システム構成）
- 12_Database_Design.md（DB設計）
- 25_GitHub_Operation.md（GitHub運用）
- 27_Roadmap.md（開発ロードマップ）

---

## 1. コーディング規約

### 1.1 TypeScript 設定方針

TypeScript は **strict モード必須**（CORE_SPEC §10）。`tsconfig.json` の主要設定は以下とする。

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // 配列アクセスは T | undefined
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,       // import type を強制
    "target": "ES2022",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

追加ルール:

- `any` は原則禁止。外部データ境界（APIレスポンス・JSONB）は `unknown` で受けて Zod でパースする
- `as` キャストは Zod パース済みデータ・テストコード・型の絞り込みが自明な箇所のみ許可。使う場合はコメントで理由を残す
- `!`（non-null assertion）は禁止。`??` / 早期 return / Zod で担保する
- `enum` は使わず `as const` オブジェクト + ユニオン型を使う（Tree-shaking と Prisma enum との混同回避のため。仮決定 DEC-240）

```ts
export const NODE_TYPE = {
  BATTLE: "BATTLE",
  STRONG: "STRONG",
  ELITE: "ELITE",
  BOSS: "BOSS",
  TREASURE: "TREASURE",
  SHOP: "SHOP",
  REST: "REST",
  EVENT: "EVENT",
  BLESS: "BLESS",
  HEAL: "HEAL",
  CURSE: "CURSE",
  STORY: "STORY",
  SECRET: "SECRET",
} as const;
export type NodeType = (typeof NODE_TYPE)[keyof typeof NODE_TYPE];
```

### 1.2 ESLint / Prettier 設定方針

- ESLint: `next/core-web-vitals` + `next/typescript` をベースに、`eslint-plugin-import`（import順序・依存方向制約）を追加
- Prettier: フォーマットは全て Prettier に委譲し、ESLint はロジック検査のみ（`eslint-config-prettier` で競合ルール無効化）
- Prettier 設定（仮決定 DEC-241）:

```jsonc
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]  // Tailwindクラス順序の自動整列
}
```

- コミット前チェックは husky + lint-staged で `eslint --fix` と `prettier --write` を実行（仮決定 DEC-103。個人開発のため CI 側検査を正とし、フックが邪魔なら外してよい）

### 1.3 命名規約

| 対象 | 規約 | 例 |
|---|---|---|
| 変数・関数 | camelCase | `calculateDamage`, `runState` |
| 型・インターフェース・クラス | PascalCase | `BattleState`, `AppError` |
| 型パラメータ | `T` 接頭辞 PascalCase | `TEntity`, `TResult` |
| 定数（モジュールレベルの固定値） | UPPER_SNAKE_CASE | `MAX_SKILL_SLOTS`, `BASE_CRIT_RATE` |
| ファイル・ディレクトリ | kebab-case | `calculate-damage.ts`, `enemy-ai/` |
| Reactコンポーネントファイル | kebab-case（export は PascalCase） | `battle-screen.tsx` → `export function BattleScreen` |
| DBテーブル・カラム | snake_case（CORE_SPEC §3） | `dungeon_runs.run_state` |
| Prismaモデル | PascalCase + `@@map`/`@map` で snake_case にマッピング | 下記参照 |
| マスタデータ code 列 | 英小文字スネーク | `swordsman_rain`, `skill_flame_slash` |
| 環境変数 | UPPER_SNAKE_CASE | `DATABASE_URL` |
| Zodスキーマ | camelCase + `Schema` 接尾辞 | `startRunRequestSchema` |
| カスタムフック | `use` 接頭辞 | `useCurrentRun` |
| Zustandストア | `use` + 名詞 + `Store` | `useBattleUiStore` |

Prisma マッピング例（DB は snake_case、アプリコードは camelCase）:

```prisma
model DungeonRun {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  runState  Json     @map("run_state")
  version   Int      @default(1)
  seed      Int
  status    String   // active / cleared / failed / retired / finalized
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("dungeon_runs")
}
```

### 1.4 import 順序

`eslint-plugin-import` の `import/order` で以下のグループ順を強制。グループ間は空行1行、グループ内はアルファベット順。

1. Node.js 組み込み（`node:crypto` 等）
2. 外部パッケージ（`react`, `next/*`, `zod` …）
3. エイリアス内部（`@/domain/*` → `@/server/*` → `@/schemas/*` → `@/lib/*` → `@/components/*` → `@/features/*` の順）
4. 相対パス（`./`, `../`）
5. 型のみ import（`import type`）は各グループ内で通常 import の後

```ts
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { calculateDamage } from "@/domain/battle/calculate-damage";
import { runRepository } from "@/server/repositories/run-repository";
import { battleActionRequestSchema } from "@/schemas/battle";

import { toBattleView } from "./battle-view";
import type { BattleViewModel } from "./types";
```

### 1.5 コメント方針

- **「何をしているか」ではなく「なぜそうしているか」を書く**。コードで自明なことは書かない
- ゲームロジックの数式は CORE_SPEC §5.4 の式番号・内容をコメントで引用する（例: `// CORE_SPEC 5.4: ダメージ = max(1, floor(atk × skillMult × ...))`）
- 公開関数（`src/domain/` の全 export 関数）は JSDoc 必須: 概要1行 + `@param` + `@returns` + 副作用の有無
- `TODO:` には必ず ISSUE-NNN か GitHub Issue 番号を併記する（`// TODO(#42): ...`）。番号なし TODO は ESLint で警告
- マジックナンバー禁止。`src/constants/` に定数化し、CORE_SPEC 由来の値はその旨をコメント

---

## 2. アーキテクチャ規則

### 2.1 レイヤ構成と依存方向

ディレクトリ構成は CORE_SPEC §9 と完全一致させる。

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

依存方向は一方向のみ許可する:

```mermaid
flowchart LR
  APP[app] --> FEAT[features]
  APP --> UC[server/usecases]
  FEAT --> COMP[components]
  FEAT --> SCH[schemas]
  UC --> DOM[domain]
  UC --> REPO[server/repositories]
  UC --> SVC[server/services]
  REPO --> DOM
  DOM --> CONST[constants]
  SCH --> CONST
```

- `app`（画面）→ `features` → `components` / `hooks` / `stores` / `schemas`
- `app`（route handler）→ `server/usecases` → `domain` + `server/repositories` + `server/services`
- `domain` が依存してよいのは `constants` / `types` / `schemas` のみ

### 2.2 domain 層の純粋性（ESLint で強制）

`src/domain/` は **Next.js・Prisma・React に一切依存しない純粋 TypeScript** とする。これにより戦闘・生成・報酬ロジックを Vitest で高速に単体テストでき、将来のランタイム移行（Edge/ネイティブ）にも耐える。

`eslint-plugin-import` の `no-restricted-paths` + `no-restricted-imports` で機械的に強制する:

```js
// eslint.config.mjs（抜粋）
{
  files: ["src/domain/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["next", "next/*", "react", "react-*"], message: "domain層はUIフレームワーク非依存" },
        { group: ["@prisma/*", "@/server/*", "@/app/*", "@/features/*", "@/components/*"],
          message: "domain層はインフラ・UI層に依存できない" },
      ],
    }],
  },
},
{
  // 逆方向依存の禁止（features → server 等）
  rules: {
    "import/no-restricted-paths": ["error", {
      zones: [
        { target: "./src/features", from: "./src/server" },
        { target: "./src/components", from: "./src/server" },
        { target: "./src/domain", from: "./src/server" },
        { target: "./src/domain", from: "./src/app" },
      ],
    }],
  },
}
```

- `domain` 内で乱数が必要な場合は `Math.random()` 禁止。必ず PRNG（mulberry32相当、DEC-019）のインスタンスを引数で受け取る
- `domain` 内で現在時刻が必要な場合は `Date.now()` 禁止。`now: Date` を引数で受け取る（テスト再現性のため）

### 2.3 repository インターフェース

- リポジトリの**インターフェースは domain 側**（`src/domain/<area>/ports.ts`）に定義し、**実装は `src/server/repositories/`** に置く（依存性逆転）
- usecase はインターフェース型に依存し、実装はエントリポイント（route handler）で注入する

```ts
// src/domain/dungeon/ports.ts
export interface RunRepository {
  findActiveByUserId(userId: string): Promise<RunRecord | null>;
  /** version不一致時は null を返す（楽観ロック, DEC-011） */
  saveWithVersion(run: RunRecord, expectedVersion: number): Promise<RunRecord | null>;
  create(run: NewRunRecord): Promise<RunRecord>;
}

// src/server/repositories/run-repository.ts — Prisma実装
export class PrismaRunRepository implements RunRepository { /* ... */ }
```

- トランザクション境界は **usecase 1関数 = 1トランザクション**。repository 単体でトランザクションを張らない。`prisma.$transaction` は usecase 層のヘルパ（`withTransaction`）経由でのみ使用

### 2.4 API 実装規則

- REST は `/api/v1` 配下の route handlers（DEC-014）。Server Actions は認証系フォーム（登録・ログイン・ゲスト開始）のみ限定利用可
- route handler は「Zodパース → 認証チェック → usecase 呼び出し → レスポンス整形」のみ。**ビジネスロジックを書かない**（最大 30 行目安）
- ラン系変更 API（API-303, 305, 306, 307, 402, 502〜508）は `Idempotency-Key` ヘッダ検証 + `run_state.version` 楽観ロックを共通ミドルウェア（`server/services/idempotency.ts`）で必須処理する（CORE_SPEC §7）
- 戦闘計算・報酬抽選・乱数は全てサーバー側（DEC-007）。クライアントに送るのは表示に必要な情報のみ（敵の内部AIテーブル・未開封報酬内容は送らない）

---

## 3. ID体系・用語集（正式版）

CORE_SPEC §3・§4 を転記し、本節を正式版とする。全コード・全ドキュメント・全Issueで統一する。

### 3.1 ID体系

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

### 3.2 用語集

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

- コード内の識別子は英語（`soulShards`, `floor`, `intent`）、UI 表示文言は上表の日本語を使う
- 用語追加が必要になった場合は本表に追記してから実装する（PR に本ファイルの diff を含める）

---

## 4. エラーハンドリング規約

### 4.1 基本方針（仮決定 DEC-104）

**usecase / domain は `AppError` クラスを throw し、route handler 側の共通ハンドラが HTTP レスポンスへ変換する**方式を採用する（Result型は不採用。仮決定 DEC-104。理由: route handler・TanStack Query との統合が単純で、個人開発での記述量が最小になるため。domain 層の「想定内分岐」— 命中/回避、成功/失敗など — はエラーではなく戻り値の型で表現し、throw は「契約違反・進行不能」のみに限定する）。

```ts
// src/server/services/app-error.ts
export class AppError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,     // ERR_〜（CORE_SPEC §7）
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// 使用例（usecase）
if (run.status !== "active") {
  throw new AppError("ERR_RUN_STATE_INVALID", 409, "ランがアクティブではありません", { status: run.status });
}
```

### 4.2 共通ハンドラ

全 route handler は `withApiHandler` ラッパーを通す。エラー共通形式は CORE_SPEC §7 の `{ errorCode, message, details, traceId, timestamp }` に統一する。

```ts
// src/server/services/api-handler.ts（骨子）
export function withApiHandler(handler: (req: NextRequest, ctx: ApiContext) => Promise<Response>) {
  return async (req: NextRequest, routeCtx: unknown): Promise<Response> => {
    const traceId = randomUUID();
    try {
      return await handler(req, buildContext(req, routeCtx, traceId));
    } catch (e) {
      if (e instanceof ZodError) {
        return errorResponse("ERR_VALIDATION", 400, "入力値が不正です", flattenZodError(e), traceId);
      }
      if (e instanceof AppError) {
        logWarn({ traceId, errorCode: e.errorCode, message: e.message });
        return errorResponse(e.errorCode, e.httpStatus, e.message, e.details, traceId);
      }
      logError({ traceId, error: serializeError(e) }); // 構造化ログ（DEC-020）
      return errorResponse("ERR_INTERNAL", 500, "サーバーエラーが発生しました", undefined, traceId);
    }
  };
}
```

規則:

- エラーコードは CORE_SPEC §7 の一覧のみ使用。追加時は CORE_SPEC 側を先に更新
- 500 系はスタックトレース付きで構造化ログ（JSON 1行）に出力。クライアントには `traceId` のみ返し内部情報を漏らさない
- クライアント側は TanStack Query の `onError` + エラーレスポンスの `errorCode` で分岐（409 の `ERR_CONFLICT_VERSION` は自動リフェッチ、401 はログイン画面へ、503 `ERR_MAINTENANCE` は SCR-009 へ）
- `catch` して握りつぶす（ログも再throwもしない）ことは禁止

### 4.3 Zod スキーマの配置と共有

- 全スキーマは `src/schemas/` に置き、**クライアント（React Hook Form の resolver）とサーバー（route handler のパース）で同一スキーマを共有**する
- 配置: `src/schemas/<領域>.ts`（`auth.ts`, `run.ts`, `battle.ts`, `player.ts`, `settings.ts`, `common.ts`）
- リクエスト/レスポンス両方を定義し、レスポンスも `parse` してから返す（サーバー内部の型漏れ検知）
- `run_state` JSONB のスキーマ（CORE_SPEC §8）は `src/schemas/run-state.ts` に定義し、`schemaVersion` によるマイグレーション関数（`migrateRunState`）とセットで管理する
- スキーマから型を導出する（`z.infer`）。手書きの重複型定義は禁止

```ts
// src/schemas/battle.ts
export const battleActionRequestSchema = z.object({
  actionType: z.enum(["attack", "skill", "guard", "item", "flee"]),
  skillCode: z.string().regex(/^[a-z0-9_]+$/).optional(),
  itemCode: z.string().regex(/^[a-z0-9_]+$/).optional(),
  targetIndex: z.number().int().min(0).max(2).optional(),
});
export type BattleActionRequest = z.infer<typeof battleActionRequestSchema>;
```

---

## 5. 環境変数管理・ローカル開発手順

### 5.1 .env.example（全項目）

`.env.example` をリポジトリにコミットし、実値は `.env.local`（gitignore 対象）に置く。

```bash
# --- Database (Neon) ---
# 通常接続（PgBouncerプール経由。アプリ実行時に使用）
DATABASE_URL="postgresql://user:password@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/rogue_chronicle?sslmode=require"
# 直接接続（prisma migrate 用。プール非経由）
DIRECT_URL="postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/rogue_chronicle?sslmode=require"

# --- Auth.js (NextAuth v5) ---
# 生成: openssl rand -base64 32
AUTH_SECRET="changeme-generate-with-openssl-rand"
# 本番のみ必要に応じて（VercelはAUTH_URL自動検出のため通常不要）
# AUTH_URL="https://example.com"
AUTH_TRUST_HOST="true"

# --- App ---
NEXT_PUBLIC_APP_URL="http://localhost:3000"
# ゲームバージョン表示用（ビルド時にタグから注入。ローカルはdev固定）
NEXT_PUBLIC_APP_VERSION="dev"

# --- 運用 ---
# メンテナンスモード即時制御のフォールバック（通常はmaintenance_settingsテーブルを使用）
MAINTENANCE_MODE="false"
# 構造化ログの最低レベル: debug / info / warn / error
LOG_LEVEL="debug"

# --- シード（scripts/seed実行時のみ） ---
# 本番シード誤実行防止フラグ。本番投入時のみ明示的にtrue
SEED_ALLOW_PRODUCTION="false"
```

規則:

- `NEXT_PUBLIC_` 接頭辞はクライアント公開可能な値のみ。秘密値（`AUTH_SECRET`, `DATABASE_URL`）には絶対に付けない
- 環境変数は `src/config/env.ts` で Zod パースして一元エクスポートし、`process.env` の直接参照は `config/` 以外で禁止（起動時に不足を検知）
- 環境ごとの実値の管理分担は 25_GitHub_Operation.md §8（Secret管理分担表）に従う

### 5.2 ローカル開発手順

前提ツール:

| ツール | バージョン | 備考 |
|---|---|---|
| Node.js | 22 LTS（`.nvmrc` = `22`） | Vercel/CI と一致させる |
| pnpm | 9系（`packageManager` フィールドで固定） | 採用（仮決定 DEC-105。理由: インストール高速・ディスク効率・厳格な依存解決） |
| Docker Desktop / Docker Engine | 最新安定 | ローカルDB用（選択肢A） |
| Git | 2.40+ | |

DB は次の2択（どちらでもよい。仮決定 DEC-106: **通常開発は選択肢A（Docker）を推奨**。理由: オフライン開発可・Neon Freeのブランチ数節約。Neon固有挙動の確認時のみ選択肢B）:

- **選択肢A: Docker で PostgreSQL 16 をローカル起動**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: rogue_chronicle
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

- **選択肢B: Neon の開発用ブランチ**（`dev/<名前>` ブランチを Neon コンソールで作成し、その接続文字列を `.env.local` に設定）

セットアップ手順:

```bash
# 1. クローンと依存インストール
git clone git@github.com:<owner>/rogue-chronicle.git
cd rogue-chronicle
nvm use                 # Node 22 LTS
corepack enable         # pnpmを有効化
pnpm install

# 2. 環境変数
cp .env.example .env.local
# .env.local を編集（選択肢Aなら DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rogue_chronicle）

# 3. DB起動（選択肢Aの場合）
docker compose up -d

# 4. マイグレーションとシード
pnpm prisma migrate dev
pnpm db:seed            # scripts/seed のマスタデータ投入

# 5. 開発サーバー起動
pnpm dev                # http://localhost:3000
```

主要 npm scripts（`package.json` に定義する正式名）:

| script | 内容 |
|---|---|
| `pnpm dev` | `next dev` |
| `pnpm build` | `prisma generate && next build` |
| `pnpm lint` | `eslint .` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | `vitest run`（単体） |
| `pnpm test:watch` | `vitest` |
| `pnpm test:e2e` | `playwright test` |
| `pnpm db:seed` | `tsx scripts/seed/index.ts` |
| `pnpm db:studio` | `prisma studio` |
| `pnpm format` | `prettier --write .` |

---

## 6. テスト方針（実装時の基準）

- 単体テスト: Vitest。`src/domain/` は**カバレッジ80%以上を必須**（純粋関数のため容易）。テストファイルは対象と同階層の `*.test.ts`
- usecase テスト: repository をインメモリ実装（`tests/fakes/`）に差し替えて Vitest で検証
- E2E: Playwright。`tests/e2e/` に配置。MVPの必須3フロー = ①ゲスト開始→ラン開始→戦闘1回→中断→再開、②登録→ログイン→ラン完走（クリア）、③敗北→リザルト→ソウルシャード反映
- テストケースIDは TC-NNN（CORE_SPEC §3）。テスト設計書（別書）との対応を `describe("TC-015: ...")` で明記
- PRNG を使うロジックのテストは固定シードで期待値を検証する（DEC-019 の再現性を利用）

---

## 7. レビュー観点チェックリスト

個人開発のため、セルフレビュー + Claude Code によるレビューで PR ごとに以下を確認する。

### 必須（1つでもNGならマージ不可）

- [ ] CI（lint / typecheck / test / build）が green
- [ ] `src/domain/` に Next.js / Prisma / React の import がない（ESLintで自動検知、目視でも確認）
- [ ] 戦闘計算・抽選・乱数がクライアント側に漏れていない（DEC-007）
- [ ] 外部入力（APIリクエスト・JSONB読込）が全て Zod でパースされている
- [ ] ラン系変更APIに Idempotency-Key + version チェックが入っている
- [ ] 秘密値（AUTH_SECRET等）がコード・ログ・クライアントバンドルに含まれていない
- [ ] DBスキーマ変更がある場合、マイグレーションが後方互換（26_Release_Plan.md §6.4 のルール準拠）
- [ ] エラーが `AppError` + 共通ハンドラ経由で処理されている（握りつぶしなし）

### 推奨（原則守る。逸脱時はPR説明に理由を書く）

- [ ] 命名規約（§1.3）・import順序（§1.4）準拠
- [ ] マジックナンバーが `constants/` に定数化されている
- [ ] CORE_SPEC の数式・用語・IDと一致している（用語揺れがない）
- [ ] 新規 export 関数に JSDoc がある
- [ ] domain 変更にテストが伴っている
- [ ] N+1クエリがない（ラン中APIは dungeon_runs 1行読み書きが基本）
- [ ] UIがスマホ幅（375px）で崩れない
- [ ] TODO に Issue 番号が付いている

---

## 8. AI（Claude Code）協働の進め方

### 8.1 基本ルール

- リポジトリ直下に `CLAUDE.md` を置き、①CORE_SPEC と docs/ 一覧への参照、②本書 §1〜§4 の要約（命名・依存方向・AppError・Zod共有）、③主要コマンド（§5.2 の scripts 表）を記載する
- タスク依頼時は必ず**参照すべき設計書を明示**する（例: 「docs/24 §2 のアーキテクチャ規則と CORE_SPEC §5.4 の計算式に従って `calculateDamage` を実装」）
- AI が設計書と矛盾する提案をした場合は設計書を正とし、設計変更が妥当なら**先に設計書を更新してから**実装する（設計書が常に最新の単一情報源）

### 8.2 タスク粒度と PR 単位

- **1 PR = 1フェーズ内の1機能**（例: 「Phase 5: ダンジョンマップ生成関数」「Phase 6: ダメージ計算+テスト」）。フェーズをまたぐ PR は禁止
- 目安: 1 PR あたり変更 500 行以内。超える場合はタスクを分割
- AI への依頼テンプレート:

```
【参照】docs/24_Development_Guideline.md, docs/<関連設計書>, CORE_SPEC §<節>
【フェーズ】Phase N（docs/27_Roadmap.md）
【タスク】<実装する機能を1つ>
【完了条件】<テストが通る・画面が表示される等、検証可能な条件>
【禁止】設計書にない機能の追加、依存パッケージの無断追加
```

### 8.3 AI 生成コードの検収

- AI 生成コードも §7 のレビュー観点を全て適用する（生成元による免除なし）
- 特に注意: ①存在しないAPI・パッケージの幻覚、②CORE_SPEC の数式の微妙な改変（係数・丸め・clamp範囲）、③`any` / `as` の濫用。数式実装は必ず CORE_SPEC と突合する
- 依存パッケージの追加は人間が承認してから `pnpm add` する（サプライチェーン対策）

---

## 未決事項

| ID | 内容 | 期限目安 |
|---|---|---|
| ISSUE-240 | husky + lint-staged（DEC-103）を実際に導入するか、CI検査のみで運用するか | Phase 1 終了時 |
| ISSUE-241 | `noUncheckedIndexedAccess` が run_state JSONB 操作で過剰に煩雑になる場合の緩和判断 | Phase 3 |
| ISSUE-242 | domain 層カバレッジ80%基準の妥当性（戦闘実装後に実測して調整） | Phase 6 |
| ISSUE-243 | CLAUDE.md の記載粒度（設計書要約をどこまで転記するか） | Phase 1 |
| ISSUE-244 | エラーメッセージの日本語文言一覧（UI表示用）をどの設計書で管理するか | Phase 2 |

## 実装時の注意点

- ESLint の依存方向制約（§2.2）は Phase 1 の初期構築時点で導入すること。後付けだと違反が蓄積して直せなくなる
- `src/config/env.ts` の Zod パースは `next build` 時にも走るため、ビルド環境（Vercel/CI）に全必須変数が揃っている必要がある。CI では dummy 値を `.env.test` で供給する
- Prisma の `@@map`/`@map` を最初のモデルから徹底すること。途中から snake_case マッピングに変えるとマイグレーションが破壊的になる
- `enum` 不採用（DEC-240）のため、Prisma スキーマ側も DB enum ではなく `String` + アプリ側 Zod 検証で統一する（Neon でのマイグレーション互換性が高い）
- PRNG（DEC-019）と時刻の注入規則（§2.2）はコードレビューで最重点確認する。1箇所でも `Math.random()` が混ざるとランの再現性検証（不正対策）が壊れる

## 関連設計書

- CORE_SPEC（設計共通仕様）— ID体系・用語・数式の原本
- 10_System_Architecture.md — レイヤ構成の全体像
- 12_Database_Design.md — テーブル定義・Prisma スキーマ
- 25_GitHub_Operation.md — ブランチ戦略・CI・PRテンプレート
- 26_Release_Plan.md — 環境構成・マイグレーション後方互換ルール
- 27_Roadmap.md — フェーズ定義（PR 単位の根拠）
