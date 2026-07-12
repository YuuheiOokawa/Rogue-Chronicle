import { expect, test } from '@playwright/test';

/**
 * スモークテスト: タイトル画面（SCR-002 プレースホルダ）が表示される。
 * Phase 11 で主要3フローのE2Eに拡張する（docs/21_Test_Design.md）。
 */
test('タイトル画面が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rogue Chronicle' })).toBeVisible();
  await expect(page.getByRole('button', { name: /はじめる/ })).toBeDisabled();
});
