// 図鑑API（API-601）のレスポンス組み立て（docs/13 §4.7、docs/09 SCR-107〜110）。
// マスタ参照はDBではなく定数（src/constants/masters）を使う。
// 未発見エントリは { code, discovered: false } のみを返し、数値・効果等の詳細データは一切含めない
// （情報チート防止。docs/13 API-601「未発見エントリの詳細データは返さない」制約）。
import { CHARACTERS, ENEMIES, EQUIPMENT, RELICS, SKILLS } from '@/constants/masters';
import type {
  CharacterMaster,
  EnemyMaster,
  EquipmentMaster,
  RelicMaster,
  SkillMaster,
} from '@/constants/masters/types';

/** レスポンス型はこのファイルで定義する（src/types/api.tsは他エージェントとの競合防止のため編集しない） */
export const CODEX_ENTRY_TYPES = ['skill', 'relic', 'enemy', 'equipment', 'character'] as const;
export type CodexEntryType = (typeof CODEX_ENTRY_TYPES)[number];

export function isCodexEntryType(value: string): value is CodexEntryType {
  return (CODEX_ENTRY_TYPES as readonly string[]).includes(value);
}

export interface CodexSummaryItem {
  type: CodexEntryType;
  discoveredCount: number;
  totalCount: number;
}

export interface CodexSummaryResponse {
  summary: CodexSummaryItem[];
}

/** 発見済み=詳細フィールド付き、未発見={code, discovered:false}のみ、の判別ユニオンを組み立てるヘルパ型 */
type WithDiscovery<T extends Record<string, unknown>> =
  | ({ code: string; discovered: true } & T)
  | { code: string; discovered: false };

export type SkillCodexEntry = WithDiscovery<{
  name: string;
  description: string;
  skillType: SkillMaster['skillType'];
  rarity: SkillMaster['rarity'];
  spCost: number;
  targetType: SkillMaster['targetType'];
  element: SkillMaster['element'];
  maxLevel: number;
}>;

export type RelicCodexEntry = WithDiscovery<{
  name: string;
  description: string;
  rarity: RelicMaster['rarity'];
  trigger: RelicMaster['trigger'];
  isCursed: boolean;
  synergyTags: RelicMaster['synergyTags'];
}>;

// 敵図鑑は docs/09 SCR-108〜110節で「撃破数も表示」と記載されているが、player_progressは
// 敵種別ごとの撃破数を持たず（totalKills/eliteKillsのみ集計）、per-enemyの永続列が存在しないため
// MVPでは撃破数を含めない（実装判断。docs/29 DEC-291参照）。
export type EnemyCodexEntry = WithDiscovery<{
  name: string;
  enemyType: EnemyMaster['enemyType'];
  element: EnemyMaster['element'];
  baseStats: { maxHp: number; atk: number; def: number; spd: number };
  baseExp: number;
  baseGold: number;
}>;

export type EquipmentCodexEntry = WithDiscovery<{
  name: string;
  description: string;
  slot: EquipmentMaster['slot'];
  weaponType: EquipmentMaster['weaponType'];
  rarity: EquipmentMaster['rarity'];
  baseStats: EquipmentMaster['baseStats'];
  basePrice: number;
}>;

export type CharacterCodexEntry = WithDiscovery<{
  name: string;
  description: string;
  element: CharacterMaster['element'];
  favoredWeaponType: CharacterMaster['favoredWeaponType'];
}>;

export type CodexEntry =
  | SkillCodexEntry
  | RelicCodexEntry
  | EnemyCodexEntry
  | EquipmentCodexEntry
  | CharacterCodexEntry;

export interface CodexListResponse<T extends CodexEntry> {
  type: CodexEntryType;
  discoveredCount: number;
  totalCount: number;
  items: T[];
}

function masterTotalCount(type: CodexEntryType): number {
  switch (type) {
    case 'skill':
      return SKILLS.length;
    case 'relic':
      return RELICS.length;
    case 'enemy':
      return ENEMIES.length;
    case 'equipment':
      return EQUIPMENT.length;
    case 'character':
      return CHARACTERS.length;
  }
}

export function buildCodexSummary(
  discoveredCountByType: Record<CodexEntryType, number>,
): CodexSummaryResponse {
  return {
    summary: CODEX_ENTRY_TYPES.map((type) => ({
      type,
      discoveredCount: discoveredCountByType[type],
      totalCount: masterTotalCount(type),
    })),
  };
}

export function buildSkillCodexList(discovered: Set<string>): CodexListResponse<SkillCodexEntry> {
  const items: SkillCodexEntry[] = [...SKILLS]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) =>
      discovered.has(s.code)
        ? {
            code: s.code,
            discovered: true,
            name: s.name,
            description: s.description,
            skillType: s.skillType,
            rarity: s.rarity,
            spCost: s.spCost,
            targetType: s.targetType,
            element: s.element,
            maxLevel: s.maxLevel,
          }
        : { code: s.code, discovered: false },
    );
  return {
    type: 'skill',
    discoveredCount: items.filter((i) => i.discovered).length,
    totalCount: items.length,
    items,
  };
}

export function buildRelicCodexList(discovered: Set<string>): CodexListResponse<RelicCodexEntry> {
  const items: RelicCodexEntry[] = [...RELICS]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) =>
      discovered.has(r.code)
        ? {
            code: r.code,
            discovered: true,
            name: r.name,
            description: r.description,
            rarity: r.rarity,
            trigger: r.trigger,
            isCursed: r.isCursed,
            synergyTags: r.synergyTags,
          }
        : { code: r.code, discovered: false },
    );
  return {
    type: 'relic',
    discoveredCount: items.filter((i) => i.discovered).length,
    totalCount: items.length,
    items,
  };
}

export function buildEnemyCodexList(discovered: Set<string>): CodexListResponse<EnemyCodexEntry> {
  const items: EnemyCodexEntry[] = [...ENEMIES]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) =>
      discovered.has(e.code)
        ? {
            code: e.code,
            discovered: true,
            name: e.name,
            enemyType: e.enemyType,
            element: e.element,
            baseStats: {
              maxHp: e.baseStats.maxHp,
              atk: e.baseStats.atk,
              def: e.baseStats.def,
              spd: e.baseStats.spd,
            },
            baseExp: e.baseExp,
            baseGold: e.baseGold,
          }
        : { code: e.code, discovered: false },
    );
  return {
    type: 'enemy',
    discoveredCount: items.filter((i) => i.discovered).length,
    totalCount: items.length,
    items,
  };
}

export function buildEquipmentCodexList(
  discovered: Set<string>,
): CodexListResponse<EquipmentCodexEntry> {
  const items: EquipmentCodexEntry[] = [...EQUIPMENT]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((eq) =>
      discovered.has(eq.code)
        ? {
            code: eq.code,
            discovered: true,
            name: eq.name,
            description: eq.description,
            slot: eq.slot,
            weaponType: eq.weaponType,
            rarity: eq.rarity,
            baseStats: eq.baseStats,
            basePrice: eq.basePrice,
          }
        : { code: eq.code, discovered: false },
    );
  return {
    type: 'equipment',
    discoveredCount: items.filter((i) => i.discovered).length,
    totalCount: items.length,
    items,
  };
}

export function buildCharacterCodexList(
  discovered: Set<string>,
): CodexListResponse<CharacterCodexEntry> {
  const items: CharacterCodexEntry[] = [...CHARACTERS]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) =>
      discovered.has(c.code)
        ? {
            code: c.code,
            discovered: true,
            name: c.name,
            description: c.description,
            element: c.element,
            favoredWeaponType: c.favoredWeaponType,
          }
        : { code: c.code, discovered: false },
    );
  return {
    type: 'character',
    discoveredCount: items.filter((i) => i.discovered).length,
    totalCount: items.length,
    items,
  };
}
