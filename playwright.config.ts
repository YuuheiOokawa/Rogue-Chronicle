import { defineConfig, devices } from '@playwright/test';

/**
 * E2Eテスト設定（docs/21_Test_Design.md）。
 * MVPの主要3フロー（登録→ラン→クリア / ゲスト→敗北 / 再開）はPhase 11で整備する。
 * CIの通常パイプラインでは実行しない（`pnpm e2e` で手動/夜間実行）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // スマホファースト（docs/08）: モバイルビューポートを第一対象とする
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
