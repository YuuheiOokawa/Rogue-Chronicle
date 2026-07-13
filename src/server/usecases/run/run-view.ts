import type { RunState } from '@/domain/dungeon/run-state';
import { selectableNodeIds } from '@/domain/dungeon/select-node';

/**
 * run_stateのクライアント表示用View（docs/13 実装時の注意点）。
 * seed / rngCursor / lastRequest 等の内部情報は**絶対に含めない**（情報チート防止）。
 */
export interface RunView {
  runId: string;
  dungeonCode: string;
  difficulty: string;
  status: string;
  version: number;
  map: RunState['map']['floors'];
  position: RunState['position'];
  visited: string[];
  selectable: string[];
  character: RunState['character'];
  skills: RunState['skills'];
  equipment: RunState['equipment'];
  relics: string[];
  items: RunState['items'];
  gold: number;
  earned: RunState['earned'];
}

export function toRunView(
  run: { id: string; dungeonCode: string; difficulty: string; status: string; version: number },
  state: RunState,
): RunView {
  return {
    runId: run.id,
    dungeonCode: run.dungeonCode,
    difficulty: run.difficulty,
    status: run.status,
    version: run.version,
    map: state.map.floors, // seedは含めない
    position: state.position,
    visited: state.visited,
    selectable: run.status === 'active' ? selectableNodeIds(state) : [],
    character: state.character,
    skills: state.skills,
    equipment: state.equipment,
    relics: state.relics,
    items: state.items,
    gold: state.gold,
    earned: state.earned,
  };
}
