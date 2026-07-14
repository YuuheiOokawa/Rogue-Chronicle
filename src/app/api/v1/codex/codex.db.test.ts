// API-601 図鑑取得のDB統合テスト。
// RUN_DB_TESTS=1 のときのみ実行する（ローカルPostgreSQL: rc/rc@localhost:5432/rogue_chronicle、シード済み前提）
import { afterAll, describe, expect, it, vi } from 'vitest';

// requireUserをモックし、テストで作成したユーザーとして呼び出せるようにする（session/Cookie不要）
let mockUserId = '';
vi.mock('@/server/services/session', () => ({
  requireUser: async () => ({ userId: mockUserId, isGuest: true, role: 'user' }),
}));

import { CHARACTERS, ENEMIES, EQUIPMENT, RELICS, SKILLS } from '@/constants/masters';
import { prisma } from '@/server/services/prisma';
import { createUserWithDefaults } from '@/server/usecases/auth/create-user';
import type {
  CodexListResponse,
  CodexSummaryResponse,
  EnemyCodexEntry,
  SkillCodexEntry,
} from '@/server/usecases/codex/codex-view';

import { GET } from './route';

const runDbTests = process.env.RUN_DB_TESTS === '1';

function req(url: string): Request {
  return new Request(url);
}

describe.skipIf(!runDbTests)('API-601 図鑑取得（DB統合）', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function createTestUser(): Promise<string> {
    const user = await createUserWithDefaults({ isGuest: true, displayName: 'テスト冒険者' });
    createdUserIds.push(user.id);
    mockUserId = user.id;
    return user.id;
  }

  it('type未指定: 5種のサマリ（discoveredCount/totalCount）を返す', async () => {
    await createTestUser();

    const res = await GET(req('http://localhost/api/v1/codex'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CodexSummaryResponse;

    expect(body.summary).toEqual(
      expect.arrayContaining([
        { type: 'skill', discoveredCount: 0, totalCount: SKILLS.length },
        { type: 'relic', discoveredCount: 0, totalCount: RELICS.length },
        { type: 'enemy', discoveredCount: 0, totalCount: ENEMIES.length },
        { type: 'equipment', discoveredCount: 0, totalCount: EQUIPMENT.length },
        { type: 'character', discoveredCount: 0, totalCount: CHARACTERS.length },
      ]),
    );
  });

  it('type=skill: 未発見エントリはcode/discoveredのみで詳細データを一切含まない（情報チート防止）', async () => {
    const userId = await createTestUser();
    const discoveredSkill = SKILLS[0];
    await prisma.playerCodex.create({
      data: { userId, entryType: 'skill', entryCode: discoveredSkill.code },
    });

    const res = await GET(req('http://localhost/api/v1/codex?type=skill'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CodexListResponse<SkillCodexEntry>;

    expect(body.type).toBe('skill');
    expect(body.totalCount).toBe(SKILLS.length);
    expect(body.discoveredCount).toBe(1);
    expect(body.items).toHaveLength(SKILLS.length);

    const found = body.items.find((i) => i.code === discoveredSkill.code)!;
    expect(found.discovered).toBe(true);
    expect(found).toMatchObject({ name: discoveredSkill.name, description: discoveredSkill.description });

    const undiscovered = body.items.filter((i) => i.code !== discoveredSkill.code);
    expect(undiscovered.length).toBeGreaterThan(0);
    for (const entry of undiscovered) {
      expect(entry.discovered).toBe(false);
      // 未発見エントリはcode/discoveredの2キーのみ（数値・効果等の詳細データを含まない）
      expect(Object.keys(entry).sort()).toEqual(['code', 'discovered']);
    }
  });

  it('type=enemy: 未発見の敵はbaseStats等の数値を返さない', async () => {
    const userId = await createTestUser();
    const discoveredEnemy = ENEMIES[0];
    await prisma.playerCodex.create({
      data: { userId, entryType: 'enemy', entryCode: discoveredEnemy.code },
    });

    const res = await GET(req('http://localhost/api/v1/codex?type=enemy'));
    const body = (await res.json()) as CodexListResponse<EnemyCodexEntry>;

    const found = body.items.find((i) => i.code === discoveredEnemy.code)!;
    expect(found).toMatchObject({ discovered: true, name: discoveredEnemy.name });
    if (found.discovered) {
      expect(found.baseStats.maxHp).toBe(discoveredEnemy.baseStats.maxHp);
    }

    const undiscovered = body.items.filter((i) => i.code !== discoveredEnemy.code);
    for (const entry of undiscovered) {
      expect(entry).toEqual({ code: entry.code, discovered: false });
      expect('baseStats' in entry).toBe(false);
    }
  });

  it('不正なtype: ERR_VALIDATION(400)', async () => {
    await createTestUser();
    const res = await GET(req('http://localhost/api/v1/codex?type=invalid_type'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('ERR_VALIDATION');
  });
});
