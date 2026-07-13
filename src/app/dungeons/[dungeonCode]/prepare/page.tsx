import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { PrepareWizard } from '@/features/run/prepare-wizard';
import { prisma } from '@/server/services/prisma';

/**
 * 出撃準備ウィザード（SCR-204 キャラ選択 / SCR-205 初期装備選択 / SCR-207 出撃確認 を
 * 1ページ3ステップで実装。docs/09 §4.4〜4.5。ルート分割は将来のUX改善で検討=仮決定）
 */
export default async function PreparePage({
  params,
}: {
  params: Promise<{ dungeonCode: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect('/');

  const { dungeonCode } = await params;
  const dungeon = DUNGEONS.find((d) => d.code === dungeonCode);
  if (!dungeon) notFound();

  const [ownedCharacters, ownedEquipment, activeRun] = await Promise.all([
    prisma.playerCharacter.findMany({ where: { userId: session.userId } }),
    prisma.playerEquipment.findMany({ where: { userId: session.userId } }),
    prisma.dungeonRun.findFirst({
      where: { userId: session.userId, status: 'active' },
      select: { id: true },
    }),
  ]);
  if (activeRun) redirect('/run/map');

  const unlockedCharacterCodes = new Set(ownedCharacters.map((c) => c.characterCode));
  const ownedEquipmentCodes = new Set(ownedEquipment.map((e) => e.equipmentCode));

  const characters = CHARACTERS.map((c) => ({
    code: c.code,
    name: c.name,
    description: c.description,
    element: c.element,
    favoredWeaponType: c.favoredWeaponType,
    baseStats: {
      maxHp: c.baseStats.maxHp,
      atk: c.baseStats.atk,
      def: c.baseStats.def,
      spd: c.baseStats.spd,
    },
    unlocked: unlockedCharacterCodes.has(c.code),
  }));
  const equipment = EQUIPMENT.filter((e) => ownedEquipmentCodes.has(e.code)).map((e) => ({
    code: e.code,
    name: e.name,
    slot: e.slot,
    weaponType: e.weaponType ?? null,
    rarity: e.rarity,
    baseStats: Object.fromEntries(
      Object.entries(e.baseStats).filter(([, v]) => typeof v === 'number'),
    ) as Record<string, number>,
  }));

  return (
    <PrepareWizard
      dungeon={{ code: dungeon.code, name: dungeon.name, floors: dungeon.floors }}
      characters={characters}
      equipment={equipment}
    />
  );
}
