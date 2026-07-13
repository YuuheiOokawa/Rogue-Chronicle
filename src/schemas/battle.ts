import { z } from 'zod';

/** API-402 行動実行（docs/13 §4.5）。クライアントは「選択」のみ送信し、数値は一切送らない（DEC-007）。 */
export const battleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('attack'), targetId: z.string().regex(/^e[0-9]+$/) }).strict(),
  z
    .object({
      type: z.literal('skill'),
      skillCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
      targetId: z.string().regex(/^(e[0-9]+|player)$/).optional(),
    })
    .strict(),
  z.object({ type: z.literal('guard') }).strict(),
  z
    .object({
      type: z.literal('item'),
      itemCode: z.string().regex(/^[a-z0-9_]{1,50}$/),
      targetId: z.string().regex(/^(e[0-9]+|player)$/).optional(),
    })
    .strict(),
  z.object({ type: z.literal('flee') }).strict(),
]);
export type BattleActionInput = z.infer<typeof battleActionSchema>;

export const battleActionRequestSchema = z
  .object({
    version: z.number().int().min(0),
    action: battleActionSchema,
  })
  .strict();
export type BattleActionRequest = z.infer<typeof battleActionRequestSchema>;
