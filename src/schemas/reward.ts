import { z } from 'zod';

/** 報酬・ノードアクション系APIの入力スキーマ（docs/13 §4.6 API-501〜508）。 */

const codeStr = z.string().regex(/^[a-z0-9_]{1,50}$/);

/** API-502 スキル選択（3択/リロール/スキップ） */
export const skillSelectSchema = z
  .object({
    version: z.number().int().min(0),
    action: z.enum(['pick', 'reroll', 'skip']),
    choiceIndex: z.number().int().min(0).max(2).optional(), // pick時必須
  })
  .strict()
  .refine((v) => v.action !== 'pick' || v.choiceIndex !== undefined, {
    message: 'choiceIndex is required when action="pick"',
    path: ['choiceIndex'],
  });
export type SkillSelectInput = z.infer<typeof skillSelectSchema>;

/** API-503 宝箱開封 */
export const treasureOpenSchema = z
  .object({
    version: z.number().int().min(0),
  })
  .strict();
export type TreasureOpenInput = z.infer<typeof treasureOpenSchema>;

/** API-504 ショップ購入/売却/離脱 */
export const shopActionSchema = z
  .object({
    version: z.number().int().min(0),
    action: z.enum(['purchase', 'sell', 'leave']),
    slotIndex: z.number().int().min(0).max(4).optional(), // purchase時必須
    equipmentCode: codeStr.optional(), // sell時必須
  })
  .strict()
  .refine((v) => v.action !== 'purchase' || v.slotIndex !== undefined, {
    message: 'slotIndex is required when action="purchase"',
    path: ['slotIndex'],
  })
  .refine((v) => v.action !== 'sell' || v.equipmentCode !== undefined, {
    message: 'equipmentCode is required when action="sell"',
    path: ['equipmentCode'],
  });
export type ShopActionInput = z.infer<typeof shopActionSchema>;

/** API-505 休憩実行 */
export const restActionSchema = z
  .object({
    version: z.number().int().min(0),
    action: z.enum(['heal', 'upgrade_skill', 'delete_skill']),
    skillCode: codeStr.optional(), // upgrade_skill/delete_skill時必須
  })
  .strict()
  .refine((v) => v.action === 'heal' || v.skillCode !== undefined, {
    message: 'skillCode is required when action is "upgrade_skill" or "delete_skill"',
    path: ['skillCode'],
  });
export type RestActionInput = z.infer<typeof restActionSchema>;

/** API-506 イベント選択（autoResolved時はchoiceIndex不要でクローズのみ） */
export const eventChooseSchema = z
  .object({
    version: z.number().int().min(0),
    choiceIndex: z.number().int().min(0).max(2).optional(),
  })
  .strict();
export type EventChooseInput = z.infer<typeof eventChooseSchema>;

/** API-507 装備変更（ラン内） */
export const runEquipmentActionSchema = z
  .object({
    version: z.number().int().min(0),
    action: z.enum(['equip', 'discard']),
    equipmentCode: codeStr,
  })
  .strict();
export type RunEquipmentActionInput = z.infer<typeof runEquipmentActionSchema>;

/** API-508 レリック取得確定（呪い付き等の辞退可能な単体提示用。現行UIはtreasure経由で完結するため予備） */
export const relicClaimSchema = z
  .object({
    version: z.number().int().min(0),
    accept: z.boolean(),
  })
  .strict();
export type RelicClaimInput = z.infer<typeof relicClaimSchema>;
