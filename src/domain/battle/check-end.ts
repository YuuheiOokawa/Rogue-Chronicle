// 戦闘終了判定（docs/20 §2.17）。
import type { BattleState } from './types';

/**
 * プレイヤーhp<=0を優先して'lose'とする（同時全滅=相打ちは敗北。仮決定 docs/20）。
 * 敵全滅で'win'。fled時は本関数を経由しない（executePlayerActionのflee成功パスで直接result設定）。
 */
export function checkBattleEnd(battle: BattleState): 'win' | 'lose' | null {
  if (battle.player.hp <= 0) return 'lose';
  if (battle.enemies.every((e) => !e.alive)) return 'win';
  return null;
}
