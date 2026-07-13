// マスタデータ 全エクスポート
// docs/の設計書（19 > 18 > 17 > 05 の優先順）を転記したTS定数。シードはprisma/seed.tsが投入する
export * from './types';

export { ACHIEVEMENTS } from './achievements';
export { CHARACTERS } from './characters';
export { DUNGEON_NODE_TYPES, DUNGEONS } from './dungeons';
export { ENEMIES } from './enemies';
export { EQUIPMENT } from './equipment';
export { RANDOM_EVENTS } from './events';
export { RELICS } from './relics';
export { DROP_CHANCE_PCT_BY_ENEMY_TYPE, REWARD_TABLES } from './reward-tables';
export { SKILLS } from './skills';
export { STORIES } from './stories';
export { UPGRADE_NODES } from './upgrades';

// マスタデータバージョン（master_data_versions.version へ記録。形式: YYYYMMDD.n）
export const MASTER_DATA_VERSION = '20260713.1';
