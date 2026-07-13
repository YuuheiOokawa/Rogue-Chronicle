import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS } from '@/constants/masters/achievements';
import { CHARACTERS } from '@/constants/masters/characters';
import { DUNGEONS } from '@/constants/masters/dungeons';
import { ENEMIES } from '@/constants/masters/enemies';
import { EQUIPMENT } from '@/constants/masters/equipment';
import { RELICS } from '@/constants/masters/relics';
import { SKILLS } from '@/constants/masters/skills';
import { generateDungeonMap } from '@/domain/dungeon/generate-map';
import { createInitialRunState, type RunState } from '@/domain/dungeon/run-state';
import { createRng } from '@/domain/shared/rng';

import { expToNextRank } from './rank';
import { codexKey, grantPersistentRewards, type PlayerPersistentData } from './grant-rewards';

const rain = CHARACTERS.find((c) => c.code === 'swordsman_rain')!;
const ironSword = EQUIPMENT.find((e) => e.code === 'iron_sword')!;
const config = DUNGEONS[0].generationConfig;

const masters = {
  achievements: ACHIEVEMENTS,
  skills: SKILLS,
  relics: RELICS,
  enemies: ENEMIES,
  equipment: EQUIPMENT,
  characters: CHARACTERS,
};

function makeRun(overrides: Partial<RunState> = {}): RunState {
  const seed = 1;
  const rng = createRng(seed);
  const map = generateDungeonMap(seed, config, rng);
  const state = createInitialRunState({
    map,
    character: rain,
    equipment: { weapon: ironSword, armor: null, accessory: null },
    rngCursor: rng.cursor,
  });
  return { ...state, ...overrides };
}

function makePlayer(overrides: Partial<PlayerPersistentData> = {}): PlayerPersistentData {
  return {
    progress: {
      rank: 1,
      rankExp: 0,
      totalRuns: 0,
      totalClears: 0,
      totalDefeats: 0,
      totalKills: 0,
      eliteKills: 0,
      bestFloor: 0,
    },
    codex: new Set(),
    achievements: new Set(),
    characters: new Set(['swordsman_rain']),
    ...overrides,
  };
}

describe('grantPersistentRewards', () => {
  it('ソウルシャードはrun.earned.soulShardsをそのまま採用し、transactionsへ記録される', () => {
    const run = makeRun({ earned: { soulShards: 123, rankExp: 0, kills: 0, eliteKills: 0 } });
    const grant = grantPersistentRewards(run, 'cleared', makePlayer(), masters, 'run-1');
    expect(grant.soulShards).toBe(123);
    expect(grant.transactions).toEqual([
      { currency: 'soul_shards', amount: 123, reason: 'run_finalize', refId: 'run-1' },
    ]);
  });

  it('複数ランクアップを一括処理する', () => {
    const need1 = expToNextRank(1);
    const need2 = expToNextRank(2);
    const run = makeRun({ earned: { soulShards: 0, rankExp: need1 + need2 + 5, kills: 0, eliteKills: 0 } });
    const grant = grantPersistentRewards(run, 'cleared', makePlayer(), masters, 'run-2');
    expect(grant.progress.rank).toBe(3);
    expect(grant.progress.rankExp).toBe(5);
    expect(grant.rankLeveledUp).toBe(2);
  });

  it('累計統計（totalRuns/totalClears/totalDefeats/totalKills/eliteKills/bestFloor）が更新される', () => {
    const run = makeRun({
      position: { floor: 7, nodeId: null, phase: 'map_select' },
      earned: { soulShards: 0, rankExp: 0, kills: 3, eliteKills: 2 },
    });
    const player = makePlayer({
      progress: {
        rank: 1,
        rankExp: 0,
        totalRuns: 4,
        totalClears: 1,
        totalDefeats: 2,
        totalKills: 10,
        eliteKills: 1,
        bestFloor: 5,
      },
    });
    const grant = grantPersistentRewards(run, 'cleared', player, masters, 'run-3');
    expect(grant.progress.totalRuns).toBe(5);
    expect(grant.progress.totalClears).toBe(2);
    expect(grant.progress.totalDefeats).toBe(2); // clearedなので敗北数は増えない
    expect(grant.progress.totalKills).toBe(13);
    expect(grant.progress.eliteKills).toBe(3);
    expect(grant.progress.bestFloor).toBe(7); // 5→7へ更新
  });

  it('failed outcomeではtotalDefeatsのみ増える', () => {
    const run = makeRun();
    const player = makePlayer();
    const grant = grantPersistentRewards(run, 'failed', player, masters, 'run-4');
    expect(grant.progress.totalDefeats).toBe(1);
    expect(grant.progress.totalClears).toBe(0);
  });

  it('実績連動キャラ解放: 累計ラン10回でach_runs_10→rogue_gald解放', () => {
    const run = makeRun();
    const player = makePlayer({
      progress: { ...makePlayer().progress, totalRuns: 9 },
    });
    const grant = grantPersistentRewards(run, 'retired', player, masters, 'run-5');
    expect(grant.unlockedAchievements).toContain('ach_runs_10');
    expect(grant.unlockedCharacters).toContain('rogue_gald');
  });

  it('既に解除済みの実績・解放済みキャラは再度含まれない', () => {
    const run = makeRun();
    const player = makePlayer({
      progress: { ...makePlayer().progress, totalRuns: 9 },
      achievements: new Set(['ach_runs_10']),
      characters: new Set(['swordsman_rain', 'rogue_gald']),
    });
    const grant = grantPersistentRewards(run, 'retired', player, masters, 'run-6');
    expect(grant.unlockedAchievements).not.toContain('ach_runs_10');
    expect(grant.unlockedCharacters).not.toContain('rogue_gald');
  });

  it('図鑑差分: 所持中のrelics/skills/equipmentのうち未登録分がcodexDiffに含まれる', () => {
    const run = makeRun({ relics: ['lucky_coin'] });
    const player = makePlayer();
    const grant = grantPersistentRewards(run, 'cleared', player, masters, 'run-7');
    expect(grant.codexDiff).toContainEqual({ entryType: 'relic', entryCode: 'lucky_coin' });
    // 初期装備(iron_sword)・初期スキルも未登録分として含まれる
    expect(grant.codexDiff).toContainEqual({ entryType: 'equipment', entryCode: 'iron_sword' });
    expect(grant.codexDiff.some((e) => e.entryType === 'skill')).toBe(true);
  });

  it('既にcodex登録済みの項目はcodexDiffに含まれない', () => {
    const run = makeRun({ relics: ['lucky_coin'] });
    const player = makePlayer({ codex: new Set([codexKey({ entryType: 'relic', entryCode: 'lucky_coin' })]) });
    const grant = grantPersistentRewards(run, 'cleared', player, masters, 'run-8');
    expect(grant.codexDiff).not.toContainEqual({ entryType: 'relic', entryCode: 'lucky_coin' });
  });
});
