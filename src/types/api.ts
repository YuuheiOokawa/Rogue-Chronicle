// Phase 4 API（API-101〜104 / 201〜203 / 602〜603）のレスポンス型。
// サーバー（route handler）とクライアント（TanStack Query）で共有する。
// docs/13_API_Design.md のレスポンス例を正とする。

export interface AnnouncementSummary {
  id: number;
  title: string;
  category: string; // update/maintenance/event
  publishedAt: string; // ISO8601
}

export interface AnnouncementItem extends AnnouncementSummary {
  body: string;
}

/** API-104 GET /announcements */
export interface AnnouncementsResponse {
  items: AnnouncementItem[];
  nextCursor: string | null;
}

/** API-101 GET /home */
export interface HomeResponse {
  player: {
    displayName: string;
    rank: number;
    rankExp: number;
    nextRankExp: number; // floor(100 × rank^1.8)
    soulShards: number;
    isGuest: boolean;
  };
  hasActiveRun: boolean;
  latestAnnouncements: AnnouncementSummary[];
  stats: { totalRuns: number; totalClears: number; bestFloor: number };
}

/** API-102 GET /player */
export interface PlayerResponse {
  displayName: string;
  isGuest: boolean;
  rank: number;
  rankExp: number;
  nextRankExp: number;
  stats: { totalRuns: number; totalClears: number; totalKills: number; bestFloor: number };
  unlockedAchievements: number;
  totalAchievements: number;
}

/** API-103 GET /player/currencies */
export interface CurrenciesResponse {
  soulShards: number;
}

/** 未解放キャラの解放条件表示情報（API-201/202） */
export type UnlockConditionView =
  | { type: 'shards'; requiredShards: number; canUnlock: boolean }
  | {
      type: 'achievement';
      achievementCode: string;
      achievementName: string;
      progress: number;
      goal: number;
    };

/** 一覧・詳細で公開する初期ステータス（docs/13 API-201の5項目） */
export interface CharacterStatsView {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
}

export interface CharacterListItem {
  code: string;
  name: string;
  type: string; // 例: 剣士・バランス（CORE_SPEC §5.5）
  element: string; // none/fire/water/wind
  unlocked: boolean;
  /** 未解放キャラは数値をマスクしnull */
  baseStats: CharacterStatsView | null;
  uniqueAbility: { name: string; description: string };
  /** 解放済みはnull */
  unlockCondition: UnlockConditionView | null;
}

/** API-201 GET /characters */
export interface CharactersResponse {
  items: CharacterListItem[];
}

export interface SkillView {
  code: string;
  name: string;
  description: string;
  element: string;
  spCost: number;
}

/** API-202 GET /characters/{code} */
export interface CharacterDetailResponse extends CharacterListItem {
  description: string;
  favoredWeaponType: string; // sword/rod/dagger/hammer
  /** 未解放キャラは数値をマスクしnull */
  growthRates: { maxHp: number; atk: number; def: number; spd: number } | null;
  initialSkills: SkillView[];
}

/** API-203 POST /characters/{code}/unlock */
export interface UnlockResponse {
  characterCode: string;
  unlocked: true;
  currencies: { soulShards: number };
}

/** API-602/603 GET・PUT /settings */
export interface SettingsResponse {
  battleSpeed: 1 | 2;
  damageDisplay: boolean;
  screenShake: boolean;
  colorAssist: boolean;
}
