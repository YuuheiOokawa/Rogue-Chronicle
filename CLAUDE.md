# Rogue Chronicle — 開発ルール（AI協働用）

ブラウザ/スマホ対応ローグライトRPG。**docs/ の設計書が唯一の正**。実装前に必ず該当設計書を参照すること。

## 必読

- `docs/CORE_SPEC.md` — ID体系・用語・計算式・画面/API/テーブル一覧（全設計書より優先）
- `docs/24_Development_Guideline.md` — コーディング規約・命名・レイヤ規則
- `docs/27_Roadmap.md` — フェーズ計画（1PR = 1フェーズ内の1機能）

## 絶対ルール

1. **サーバー権威（DEC-007）**: クライアントからダメージ値・報酬・通貨などの数値を受け取らない。クライアントは「選択」のみ送信。
2. **domain層の純粋性**: `src/domain/` はNext.js/React/Prisma/server層をimportしない（ESLintで強制）。乱数は `Rng`、時刻は `now: Date` を引数注入。`Math.random()`/`Date.now()` 直接使用禁止。
3. **依存方向**: `app → features → server → domain`。逆流禁止。
4. **ラン系変更APIの共通順序**: 冪等キー確認 → version検証（楽観ロック）→ 正当性検証 → domain解決 → saveRunProgress。
5. **設計と異なる判断をしたら**: 実装前に `docs/29_Decision_Log.md` へ追記。新たな未決事項は `docs/28_Open_Issues.md` へ。
6. **ID・用語**: SCR-NNN（画面）/ API-NNN / FN-NNN / ERR_XXX / snake_caseテーブル名 / CORE_SPEC §4の用語（ラン・ノード・階層・ソウルシャード等）を厳守。

## コマンド

`pnpm dev` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm db:migrate` / `pnpm db:seed`

## コミット

Conventional Commits（feat/fix/docs/refactor/test/chore）。日本語本文可。
