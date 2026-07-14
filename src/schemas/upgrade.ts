import { z } from 'zod';

/** API-204 永続強化実行 の入力スキーマ（docs/13 §4.3） */
export const upgradeSchema = z
  .object({
    upgradeNodeCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
    targetRank: z.number().int().min(1).max(5), // 期待する購入後の段数（二重購入検知用）
  })
  .strict();
export type UpgradeInput = z.infer<typeof upgradeSchema>;
