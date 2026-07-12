import { PrismaClient } from '@prisma/client';

/**
 * PrismaClientのシングルトン。
 * Next.jsのdev環境ではホットリロードごとの多重生成を避けるためglobalThisにキャッシュする。
 * server層以外からのimportは禁止（eslintのimport制約で強制。domain層はDBへ直接触れない）。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
