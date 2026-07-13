import { v7 as uuidv7 } from 'uuid';

import { prisma } from '@/server/services/prisma';

/** 初期解放キャラ（CORE_SPEC §5.5: レインのみ初期解放） */
const INITIAL_CHARACTER_CODE = 'swordsman_rain';
/** レインの初期武器（永続解放。マスタseed前でも動作するようコードのみ参照） */
const INITIAL_EQUIPMENT_CODES = ['iron_sword'];

interface CreateUserParams {
  email?: string;
  passwordHash?: string;
  isGuest: boolean;
  displayName: string;
}

/**
 * ユーザー作成の共通処理（API-001登録 / ゲスト開始provider から使用）。
 * users + profile + settings + progress + currencies + 初期キャラ/装備解放を1トランザクションで作成する。
 */
export async function createUserWithDefaults(params: CreateUserParams) {
  const userId = uuidv7();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: userId,
        email: params.email ?? null,
        passwordHash: params.passwordHash ?? null,
        isGuest: params.isGuest,
        lastAccessAt: new Date(),
        profile: { create: { displayName: params.displayName } },
        settings: { create: {} },
        progress: { create: {} },
        currencies: { create: {} },
        characters: { create: { characterCode: INITIAL_CHARACTER_CODE } },
        equipment: {
          create: INITIAL_EQUIPMENT_CODES.map((equipmentCode) => ({ equipmentCode })),
        },
      },
    });
    return user;
  });
}

/** ゲスト用の表示名を生成する（例: 冒険者3F2A） */
export function generateGuestDisplayName(entropy: string): string {
  return `冒険者${entropy.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}
