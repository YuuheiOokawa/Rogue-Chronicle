import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/generated/**']),

  // 依存方向の強制（docs/24_Development_Guideline.md §2 / docs/10 §6）
  // domain層: 純粋なゲームロジックのみ。フレームワーク・DB・server層への依存を禁止する。
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*', 'react', 'react-*', '@prisma/*'],
              message:
                'domain層はNext.js/React/Prismaに依存してはならない（DEC-004/DEC-011関連の層分離）',
            },
            {
              group: [
                '@/server/*',
                '@/app/*',
                '@/features/*',
                '@/components/*',
                '@/stores/*',
                '@/hooks/*',
              ],
              message: 'domain層は上位レイヤ（server/app/features/UI）へ依存してはならない',
            },
          ],
        },
      ],
      // 乱数・時刻はRng/引数注入のみ（DEC-019、docs/20 §2.0）
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'domain層ではMath.random()禁止。Rng（src/domain/shared/rng.ts）を引数注入すること',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'domain層ではDate.now()禁止。now: Date を引数注入すること',
        },
      ],
    },
  },

  // server層: UI・featuresへの依存を禁止（依存方向: app → features → server → domain）
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/features/*', '@/components/*', '@/stores/*', '@/hooks/*'],
              message: 'server層はUI層（app/features/components）へ依存してはならない',
            },
          ],
        },
      ],
    },
  },

  // Prisma直接importはserver層のみ許可
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/*'],
              message: 'PrismaはServer層（src/server/**）からのみ使用する（docs/24 §2）',
            },
          ],
        },
      ],
    },
  },

  // Prettierと競合するフォーマット系ルールを無効化（最後に置く）
  prettier,
]);

export default eslintConfig;
