# masters

docs/ の設計書（優先順: 19 > 18 > 17 > 05）を転記したマスタデータのTS定数。

- `types.ts` — 各マスタ行のZodスキーマ + TS型（prisma/schema.prisma のマスタモデルと対応）
- `characters.ts` / `skills.ts` / `equipment.ts` / `relics.ts` / `enemies.ts` /
  `dungeons.ts` / `events.ts` / `reward-tables.ts` / `upgrades.ts` / `achievements.ts` / `stories.ts` — データ本体
- `index.ts` — 全エクスポート + `MASTER_DATA_VERSION`
- `masters.test.ts` — スキーマ・code重複・参照整合・件数・effect params の検証

DBへの投入は `pnpm db:seed`（prisma/seed.ts。codeでupsert・ネストはdeleteMany→createの冪等シード）。
データ変更時は `MASTER_DATA_VERSION`（YYYYMMDD.n）を上げること。
docs間で値が食い違った箇所と採用判断は各ファイル末尾コメントおよび docs/29_Decision_Log.md（DEC-272〜276）を参照。
