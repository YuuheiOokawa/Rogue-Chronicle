import { describe, expect, it } from 'vitest';

import { linkGuestSchema, registerSchema } from './auth';

describe('registerSchema（docs/14 §2 パスワードポリシー）', () => {
  const valid = { email: 'Test@Example.com', password: 'abcd1234' };

  it('正常な入力を受理し、emailを正規化（小文字化）する', () => {
    const r = registerSchema.parse(valid);
    expect(r.email).toBe('test@example.com');
  });

  it.each([
    ['短すぎる（7文字）', 'abc1234'],
    ['数字なし', 'abcdefgh'],
    ['英字なし', '12345678'],
  ])('パスワード違反を拒否: %s', (_label, password) => {
    expect(registerSchema.safeParse({ ...valid, password }).success).toBe(false);
  });

  it('不正なemailを拒否する', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('未知のフィールドを拒否する（.strict()）', () => {
    expect(registerSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it('表示名は12文字まで', () => {
    expect(registerSchema.safeParse({ ...valid, displayName: 'あ'.repeat(12) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, displayName: 'あ'.repeat(13) }).success).toBe(
      false,
    );
  });
});

describe('linkGuestSchema', () => {
  it('登録と同じパスワードポリシーを要求する', () => {
    expect(linkGuestSchema.safeParse({ email: 'a@b.co', password: 'abcd1234' }).success).toBe(true);
    expect(linkGuestSchema.safeParse({ email: 'a@b.co', password: 'short1' }).success).toBe(false);
  });
});
