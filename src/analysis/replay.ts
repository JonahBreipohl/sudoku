// Replays a record's root-to-cursor path keeping the state before every event
// (docs/ARCHITECTURE.md, "Mistake analysis", step 1).
//
// Analysis may import state *types* only, so the board semantics are restated here. They must
// match src/state/reducer.ts exactly; mistakes.test.ts cross-checks the two on random paths.

import {
  PEERS,
  computeCandidates,
  digitBit,
  parseGrid,
  type CandidateMask,
  type CellValue,
  type Digit,
} from "../engine";
import type { BoardEvent, GameRecord } from "../state/events";

export interface ReplayState {
  readonly board: readonly CellValue[];
  readonly notes: readonly CandidateMask[];
}

export interface Replay {
  givens: readonly CellValue[];
  solution: readonly CellValue[];
  /** Board events from the root to the cursor, in play order. */
  path: readonly BoardEvent[];
  /** states[i] is the state before path[i]; states[path.length] is the state at the cursor. */
  states: readonly ReplayState[];
}

/** The state after `event`, as a fresh object. Edits aimed at givens are ignored. */
export function applyEvent(givens: readonly CellValue[], state: ReplayState, event: BoardEvent): ReplayState {
  const board = [...state.board];
  const notes = [...state.notes];
  switch (event.type) {
    case "place":
    case "hint-reveal": {
      if (givens[event.cell] !== 0) break;
      board[event.cell] = event.digit as Digit;
      notes[event.cell] = 0;
      const bit = digitBit(event.digit as Digit);
      for (const peer of PEERS[event.cell]!) notes[peer] = notes[peer]! & ~bit;
      break;
    }
    case "erase":
      if (givens[event.cell] === 0) board[event.cell] = 0;
      break;
    case "note": {
      if (board[event.cell] !== 0) break;
      const bit = digitBit(event.digit as Digit);
      notes[event.cell] = event.on ? notes[event.cell]! | bit : notes[event.cell]! & ~bit;
      break;
    }
    case "auto-notes": {
      const candidates = computeCandidates(board);
      for (let cell = 0; cell < 81; cell++) notes[cell] = board[cell] === 0 ? candidates[cell]! : 0;
      break;
    }
    case "reset":
      for (let cell = 0; cell < 81; cell++) board[cell] = givens[cell]!;
      notes.fill(0);
      break;
  }
  return { board, notes };
}

/** Events from the root to `cursor`, in play order. */
export function pathTo(nodes: readonly BoardEvent[], cursor: number): BoardEvent[] {
  const out: BoardEvent[] = [];
  for (let id = cursor; id >= 0; id = nodes[id]!.parent) out.push(nodes[id]!);
  return out.reverse();
}

/** Replays the path ending at the record's cursor. Does not modify the record. */
export function replayRecord(record: GameRecord): Replay {
  const givens = parseGrid(record.puzzle);
  const solution = parseGrid(record.solution);
  const path = pathTo(record.nodes, record.cursor);
  const states: ReplayState[] = [{ board: givens, notes: new Array<CandidateMask>(81).fill(0) }];
  for (const event of path) states.push(applyEvent(givens, states[states.length - 1]!, event));
  return { givens, solution, path, states };
}
