// ラン終了状態への遷移（docs/20 §2.27-2.29 completeDungeon/failDungeon/retireDungeon）。
// DEC-025: リタイアはphase（map_select/battle/reward_pending）を問わず常にretired（80%）へ遷移する
// （戦闘中でも敗北50%扱いにはしない。docs/29 DEC-025）。
//
// 【設計判断】status（active→cleared/failed/retired）自体はdungeon_runs.status列（DB）で管理され
// RunStateには含まれないため、本関数はDB更新を行わない（呼び出し側=UseCaseの責務）。
// ここでは「earned（持ち帰り資産）の確定」と「battle/pendingRewardのクリア」のみを行う。
// position.phaseは終了後に無意味になるため、battle/pendingRewardのnull不変条件を満たす
// 'map_select' へ揃える（以後この RunState が再利用されることは無い前提）。
import type { RunState } from './run-state';

export class FinalizeStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalizeStatusError';
  }
}

function applySoulShardCoefficient(rawEarned: number, pct: number, bonus: number): number {
  return Math.floor(rawEarned * (pct / 100)) + bonus;
}

/** rankExp確定 = 到達階層×10 + kills×2 + クリアボーナス（docs/20 §2.27） */
function confirmRankExp(state: RunState, clearBonus: number): number {
  return state.position.floor * 10 + state.earned.kills * 2 + clearBonus;
}

function finalizeEarned(state: RunState, soulShards: number, rankExp: number): RunState {
  return {
    ...state,
    battle: null,
    pendingReward: null,
    position: { ...state.position, phase: 'map_select' },
    earned: { ...state.earned, soulShards, rankExp },
  };
}

/**
 * completeDungeon（docs/20 §2.27）。ソウルシャード100%+クリアボーナス50 / rankExp+100ボーナス。
 * 簡易検証: 最終階層（BOSS）到達をposition.floorで確認する（「BOSS撃破直後」の厳密な検証は
 * battle.result==='win'をこの時点で保持しない設計のため、呼び出し側UseCaseが戦闘勝利直後にのみ
 * 本関数を呼ぶことで担保する前提とする）。
 */
export function completeDungeon(state: RunState): RunState {
  const lastFloor = state.map.floors.length;
  if (state.position.floor !== lastFloor) {
    throw new FinalizeStatusError(
      `completeDungeon requires the final floor (${lastFloor}) to be reached, got ${state.position.floor}`,
    );
  }
  const soulShards = applySoulShardCoefficient(state.earned.soulShards, 100, 50);
  const rankExp = confirmRankExp(state, 100);
  return finalizeEarned(state, soulShards, rankExp);
}

/** failDungeon（docs/20 §2.28）。ソウルシャード50%。character.hp<=0を検証する。 */
export function failDungeon(state: RunState): RunState {
  if (state.character.hp > 0) {
    throw new FinalizeStatusError('failDungeon requires character.hp <= 0');
  }
  const soulShards = applySoulShardCoefficient(state.earned.soulShards, 50, 0);
  const rankExp = confirmRankExp(state, 0);
  return finalizeEarned(state, soulShards, rankExp);
}

/** retireDungeon（docs/20 §2.29 / DEC-025）。ソウルシャード80%。phase不問で事前条件なし。 */
export function retireDungeon(state: RunState): RunState {
  const soulShards = applySoulShardCoefficient(state.earned.soulShards, 80, 0);
  const rankExp = confirmRankExp(state, 0);
  return finalizeEarned(state, soulShards, rankExp);
}
