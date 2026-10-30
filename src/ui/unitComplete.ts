import type { Grid } from "../engine";

export interface CompletedUnit {
  kind: "row" | "column" | "box";
  /** 0-based index of the row, column or box. */
  index: number;
  /** The nine cell indices, in reading order. */
  cells: number[];
}

function unitCells(kind: CompletedUnit["kind"], index: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 9; k++) {
    if (kind === "row") out.push(index * 9 + k);
    else if (kind === "column") out.push(k * 9 + index);
    else out.push((Math.floor(index / 3) * 3 + Math.floor(k / 3)) * 9 + (index % 3) * 3 + (k % 3));
  }
  return out;
}

const filledClean = (cells: number[], board: Grid, conflicts: ReadonlySet<number>) =>
  cells.every((c) => board[c] !== 0 && !conflicts.has(c));

/**
 * Units that a placement at `cell` just completed: nine digits and no conflicts. Judged only
 * from the board and its conflicts, never the solution, so it cannot leak correctness. Erasing
 * completes nothing, and a unit that was already complete before the move is not reported again.
 */
export function unitsCompletedBy(prev: Grid, next: Grid, conflicts: ReadonlySet<number>, cell: number): CompletedUnit[] {
  if (next[cell] === 0 || prev[cell] === next[cell]) return [];
  const row = Math.floor(cell / 9);
  const col = cell % 9;
  const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
  const candidates: [CompletedUnit["kind"], number][] = [["row", row], ["column", col], ["box", box]];
  const out: CompletedUnit[] = [];
  for (const [kind, index] of candidates) {
    const cells = unitCells(kind, index);
    if (!filledClean(cells, next, conflicts)) continue;
    // Overwriting a digit inside a unit that was already full and valid is not a new completion.
    if (prev[cell] !== 0 && cells.every((c) => prev[c] !== 0) && new Set(cells.map((c) => prev[c])).size === 9) continue;
    out.push({ kind, index, cells });
  }
  return out;
}

export const unitLabel = (u: CompletedUnit) =>
  `${u.kind === "row" ? "Row" : u.kind === "column" ? "Column" : "Box"} ${u.index + 1} complete`;
