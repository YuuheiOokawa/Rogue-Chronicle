import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// DB統合テスト（RUN_DB_TESTS=1時のみ実行）がDATABASE_URLを参照できるよう.envを読み込む（Node 22+）
try {
  process.loadEnvFile('.env');
} catch {
  // .envが無い環境（CI等）はシェル環境変数をそのまま使う
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 単体テストはソースと同階層に置く（*.test.ts）。E2Eは tests/e2e（Playwright管轄）
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // domain層90%目標（docs/21_Test_Design.md）。カバレッジ計測は `vitest run --coverage`
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      thresholds: {
        // Phase 1 は shared/rng のみのため高い初期値を維持できる。閾値の段階調整はP11で行う
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
