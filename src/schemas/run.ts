import { z } from 'zod';

/** ラン系APIの入力スキーマ（docs/13 §4.4） */

/** API-303 ダンジョン開始 */
export const startRunSchema = z
  .object({
    dungeonCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
    difficulty: z.string().regex(/^[a-z0-9_]{1,30}$/).default('normal'),
    characterCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
    equipment: z
      .object({
        weapon: z.string().regex(/^[a-z0-9_]{1,50}$/).nullable().default(null),
        armor: z.string().regex(/^[a-z0-9_]{1,50}$/).nullable().default(null),
        accessory: z.string().regex(/^[a-z0-9_]{1,50}$/).nullable().default(null),
      })
      .default({ weapon: null, armor: null, accessory: null }),
  })
  .strict();
export type StartRunInput = z.infer<typeof startRunSchema>;

/** API-305 次ノード選択 */
export const selectNodeSchema = z
  .object({
    version: z.number().int().min(0),
    nodeId: z.string().regex(/^f\d+n\d+$/),
  })
  .strict();

/** API-306 リタイア */
export const retireSchema = z
  .object({
    version: z.number().int().min(0),
  })
  .strict();

/** API-307 リザルト確定（finalize） */
export const finalizeSchema = z
  .object({
    version: z.number().int().min(0),
  })
  .strict();
export type FinalizeInput = z.infer<typeof finalizeSchema>;
