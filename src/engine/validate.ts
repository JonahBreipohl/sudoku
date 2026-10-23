import { CELL_COUNT, PEERS, type Grid } from "./grid";

/** Cells whose value is repeated by at least one peer. */
export function findConflicts(grid: Grid): Set<number> {
  const conflicts = new Set<number>();
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const v = grid[cell];
    if (!v) continue;
    for (const peer of PEERS[cell]!) {
      if (grid[peer] === v) {
        conflicts.add(cell);
        break;
      }
    }
  }
  return conflicts;
}

export function isFilled(grid: Grid): boolean {
  return grid.every((v) => v !== 0);
}

/** True for a full grid that breaks no rule. */
export function isSolved(grid: Grid): boolean {
  return isFilled(grid) && findConflicts(grid).size === 0;
}

/** Cells that are filled but differ from the solution. */
export function cellsWrongVsSolution(grid: Grid, solution: Grid): number[] {
  const wrong: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const v = grid[cell];
    if (v && v !== solution[cell]) wrong.push(cell);
  }
  return wrong;
}

/** True when every filled cell agrees with the given cells of `givens` (givens are kept). */
export function respectsGivens(grid: Grid, givens: Grid): boolean {
  return givens.every((g, cell) => g === 0 || grid[cell] === g);
}
