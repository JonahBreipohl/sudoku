// Fast bitmask backtracking solver. It answers "what is a solution?" quickly; it does not
// explain itself (that is the human-style solver's job). The generator and uniqueness checks
// sit on top of it, so the hot loop avoids allocation unless an rng asks for shuffled order.

import { ALL_CANDIDATES, CELL_COUNT, UNITS, boxOf, colOf, rowOf, type CellValue, type Digit, type Grid } from "./grid";
import type { Rng } from "./random";

const ROW = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => rowOf(cell));
const COL = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => colOf(cell));
const BOX = Uint8Array.from({ length: CELL_COUNT }, (_, cell) => boxOf(cell));
/** UNITS flattened: unit u holds cells UNIT_CELLS[u * 9 .. u * 9 + 8]. */
const UNIT_CELLS = Uint8Array.from(UNITS.flat());

/** Bit count for every 9-bit mask; a table beats a loop in the cell-selection scan. */
const POPCOUNT = Uint8Array.from({ length: ALL_CANDIDATES + 1 }, (_, mask) => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
});

interface SearchState {
  values: Uint8Array;
  /** Used-digit masks per row, column and box: bit (d - 1) set when d is placed there. */
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
  /** Empty cells; positions below the current depth are filled, the rest are open. */
  empties: Uint8Array;
  emptyCount: number;
  /** Scratch candidate masks, rebuilt at every node; filled cells read 0. */
  cands: Uint16Array;
  /** Per-depth move lists (9 slots per depth): the cell and digit each branch places. */
  moveCells: Uint8Array;
  moveDigits: Uint8Array;
}

/** Builds the search state, or returns null when two givens already conflict. */
function initState(grid: Grid): SearchState | null {
  if (grid.length !== CELL_COUNT) throw new Error(`Expected 81 cells, got ${grid.length}`);
  const state: SearchState = {
    values: new Uint8Array(CELL_COUNT),
    rows: new Uint16Array(9),
    cols: new Uint16Array(9),
    boxes: new Uint16Array(9),
    empties: new Uint8Array(CELL_COUNT),
    emptyCount: 0,
    cands: new Uint16Array(CELL_COUNT),
    moveCells: new Uint8Array(CELL_COUNT * 9),
    moveDigits: new Uint8Array(CELL_COUNT * 9),
  };
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const v = grid[cell]!;
    if (!Number.isInteger(v) || v < 0 || v > 9) {
      throw new RangeError(`Invalid value ${String(v)} at cell ${cell}`);
    }
    if (v === 0) {
      state.empties[state.emptyCount++] = cell;
      continue;
    }
    const bit = 1 << (v - 1);
    const r = ROW[cell]!;
    const c = COL[cell]!;
    const b = BOX[cell]!;
    if ((state.rows[r]! | state.cols[c]! | state.boxes[b]!) & bit) return null;
    state.values[cell] = v;
    state.rows[r]! |= bit;
    state.cols[c]! |= bit;
    state.boxes[b]! |= bit;
  }
  return state;
}

/**
 * Depth-first search over the open cells. Calls onSolution for every complete grid it reaches;
 * onSolution returns true to stop the search (one solution for solve, `limit` for counting).
 * Returns true when the search was stopped.
 *
 * Each node branches on the tightest choice it can find: either the open cell with the fewest
 * candidates, or a digit with the fewest places left in some row, column or box (the way
 * dancing links picks its column). The branches of one node are mutually exclusive (one cell
 * with different digits, or one digit in different cells of a unit), so every solution is
 * reached exactly once and counting stays exact.
 */
function search(state: SearchState, depth: number, rng: Rng | undefined, onSolution: () => boolean): boolean {
  const { values, rows, cols, boxes, empties, emptyCount, cands, moveCells, moveDigits } = state;
  if (depth === emptyCount) return onSolution();

  let bestCell = -1;
  let bestMask = 0;
  let bestCount = 10;
  cands.fill(0);
  for (let pos = depth; pos < emptyCount; pos++) {
    const cell = empties[pos]!;
    const mask = ~(rows[ROW[cell]!]! | cols[COL[cell]!]! | boxes[BOX[cell]!]!) & ALL_CANDIDATES;
    cands[cell] = mask;
    const count = POPCOUNT[mask]!;
    if (count < bestCount) {
      bestCount = count;
      bestMask = mask;
      bestCell = cell;
      if (count === 0) return false;
      // Nothing beats a naked single, so the unit scan below (which needs every mask) is skipped.
      if (count === 1) break;
    }
  }

  const base = depth * 9;
  let moveCount = 0;

  // Without a naked single, look per unit for a digit with no place (dead end), one place (a
  // hidden single) or two places. Cell-only search notices these far too late: on Inkala 2012
  // it visits several times as many nodes.
  if (bestCount > 1) {
    let unitStart = -1;
    let unitBit = 0;
    let unitCount = bestCount;
    for (let u = 0; u < 27; u++) {
      const start = u * 9;
      let once = 0;
      let twice = 0;
      let thrice = 0;
      for (let i = start; i < start + 9; i++) {
        const m = cands[UNIT_CELLS[i]!]!;
        thrice |= twice & m;
        twice |= once & m;
        once |= m;
      }
      const placed = u < 9 ? rows[u]! : u < 18 ? cols[u - 9]! : boxes[u - 18]!;
      if ((once | placed) !== ALL_CANDIDATES) return false;
      const single = once & ~twice;
      if (single) {
        unitStart = start;
        unitBit = single & -single;
        break;
      }
      const pair = twice & ~thrice;
      if (pair && unitCount > 2) {
        unitStart = start;
        unitBit = pair & -pair;
        unitCount = 2;
      }
    }
    if (unitStart >= 0) {
      const d = 32 - Math.clz32(unitBit);
      for (let i = unitStart; i < unitStart + 9; i++) {
        const cell = UNIT_CELLS[i]!;
        if (cands[cell]! & unitBit) {
          moveCells[base + moveCount] = cell;
          moveDigits[base + moveCount++] = d;
        }
      }
    }
  }

  if (moveCount === 0) {
    // Lowest set bit first gives ascending digit order.
    for (let m = bestMask; m; m &= m - 1) {
      moveCells[base + moveCount] = bestCell;
      moveDigits[base + moveCount++] = 32 - Math.clz32(m & -m);
    }
  }

  if (rng) {
    // Fisher-Yates in place over this node's slice of the move buffers.
    for (let i = moveCount - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const cell = moveCells[base + i]!;
      const d = moveDigits[base + i]!;
      moveCells[base + i] = moveCells[base + j]!;
      moveDigits[base + i] = moveDigits[base + j]!;
      moveCells[base + j] = cell;
      moveDigits[base + j] = d;
    }
  }

  for (let k = 0; k < moveCount; k++) {
    const cell = moveCells[base + k]!;
    const d = moveDigits[base + k]!;
    const bit = 1 << (d - 1);
    const r = ROW[cell]!;
    const c = COL[cell]!;
    const b = BOX[cell]!;
    // Move the chosen cell to the front of the open list; deeper levels only scan past depth.
    const pos = empties.indexOf(cell, depth);
    empties[pos] = empties[depth]!;
    empties[depth] = cell;
    values[cell] = d;
    rows[r]! |= bit;
    cols[c]! |= bit;
    boxes[b]! |= bit;
    const stop = search(state, depth + 1, rng, onSolution);
    rows[r]! &= ~bit;
    cols[c]! &= ~bit;
    boxes[b]! &= ~bit;
    values[cell] = 0;
    if (stop) return true;
  }
  return false;
}

/**
 * Returns a solution of `grid`, or null when it has none (conflicting givens included).
 * Without an rng the search order is fixed, so the result is deterministic. With an rng each
 * node tries its candidates in shuffled order, which the generator uses to build random full
 * grids from an empty one. The input is never mutated.
 */
export function solve(grid: Grid, rng?: Rng): CellValue[] | null {
  const state = initState(grid);
  if (!state) return null;
  let solution: CellValue[] | null = null;
  search(state, 0, rng, () => {
    solution = Array.from(state.values, (v) => v as Digit);
    return true;
  });
  return solution;
}
