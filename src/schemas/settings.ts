import { z } from 'zod';

/** API-603 設定更新の入力（docs/13 §4.9。全項目上書きのため自然冪等） */
export const settingsUpdateSchema = z
  .object({
    battleSpeed: z.union([z.literal(1), z.literal(2)]),
    damageDisplay: z.boolean(),
    screenShake: z.boolean(),
    colorAssist: z.boolean(),
  })
  .strict();

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
