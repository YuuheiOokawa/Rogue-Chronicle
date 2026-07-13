import { describe, expect, it } from 'vitest';

import { determineTurnOrder } from './turn-order';

describe('determineTurnOrder', () => {
  it('spd降順に並ぶ', () => {
    const order = determineTurnOrder([
      { id: 'e0', spd: 5, alive: true },
      { id: 'player', spd: 10, alive: true },
      { id: 'e1', spd: 8, alive: true },
    ]);
    expect(order).toEqual(['player', 'e1', 'e0']);
  });

  it('同値はplayerが優先される', () => {
    const order = determineTurnOrder([
      { id: 'e0', spd: 10, alive: true },
      { id: 'player', spd: 10, alive: true },
    ]);
    expect(order).toEqual(['player', 'e0']);
  });

  it('死亡者は行動順から除外される', () => {
    const order = determineTurnOrder([
      { id: 'e0', spd: 20, alive: false },
      { id: 'player', spd: 10, alive: true },
      { id: 'e1', spd: 5, alive: true },
    ]);
    expect(order).toEqual(['player', 'e1']);
  });

  it('敵同士の同値は入力配列順を維持する（安定ソート）', () => {
    const order = determineTurnOrder([
      { id: 'e0', spd: 8, alive: true },
      { id: 'e1', spd: 8, alive: true },
      { id: 'e2', spd: 8, alive: true },
    ]);
    expect(order).toEqual(['e0', 'e1', 'e2']);
  });

  it('実効spd（呼び出し側でspdUp/Down適用済み）を渡せばそのまま反映される', () => {
    // spdUp+30%適用後の実効値を模したケース
    const order = determineTurnOrder([
      { id: 'e0', spd: 10, alive: true },
      { id: 'player', spd: Math.floor(10 * 1.3), alive: true },
    ]);
    expect(order).toEqual(['player', 'e0']);
  });
});
