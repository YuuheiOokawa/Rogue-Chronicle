// 行動順決定（docs/20 §2.7 determineTurnOrder / CORE_SPEC §5.1）。
// spd降順。同値はplayer優先。それ以外の同値は入力配列順（安定ソート）を維持する。

export interface TurnOrderActor {
  id: string;
  /** 実効spd（呼び出し側でeffectiveSpd適用済みのもの） */
  spd: number;
  alive: boolean;
}

export function determineTurnOrder(actors: readonly TurnOrderActor[]): string[] {
  return actors
    .filter((a) => a.alive)
    .sort((a, b) => {
      const d = b.spd - a.spd;
      if (d !== 0) return d;
      if (a.id === 'player' && b.id !== 'player') return -1;
      if (b.id === 'player' && a.id !== 'player') return 1;
      return 0; // Array.prototype.sortは安定ソート
    })
    .map((a) => a.id);
}
