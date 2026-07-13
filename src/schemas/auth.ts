import { z } from 'zod';

/**
 * 認証系入力スキーマ（docs/14 §2: 8文字以上・英字と数字を含む）。
 * クライアント（フォーム）とサーバー（API）で共用する。
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('メールアドレスの形式が正しくありません')
  .max(255);

export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上にしてください')
  .max(72, 'パスワードは72文字以内にしてください') // bcrypt入力上限
  .regex(/[a-zA-Z]/, 'パスワードには英字を含めてください')
  .regex(/[0-9]/, 'パスワードには数字を含めてください');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, '表示名を入力してください')
  .max(12, '表示名は12文字以内にしてください');

/** API-001 ユーザー登録 */
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

/** API-002 ログイン（Auth.js credentials providerでも同スキーマで検証） */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(72),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

/** API-006 ゲスト引き継ぎ（ゲストユーザーへemail/passwordを付与） */
export const linkGuestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
export type LinkGuestInput = z.infer<typeof linkGuestSchema>;

/** API-008 退会（誤操作防止の確認文字列） */
export const withdrawSchema = z
  .object({
    confirm: z.literal('退会します'),
  })
  .strict();
