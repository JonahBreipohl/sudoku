import type { Grid } from "../engine";
import { checkMessage } from "../state/check";

export interface BoardView {
  board: Grid;
  conflicts: ReadonlySet<number>;
}

const where = (cell: number) => `row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`;

/**
 * Screen-reader sentence for a board change, or null when nothing worth saying changed
 * (note edits, no-ops). Multi-cell changes (undo, reset) get one summary, not a per-cell flood.
 */
export function describeChange(prev: BoardView, next: BoardView, solution: string): string | null {
  const changed: number[] = [];
  for (let i = 0; i < 81; i++) if (prev.board[i] !== next.board[i]) changed.push(i);
  if (changed.length === 0) return null;
  const solved = next.board.every((v, i) => v !== 0 && String(v) === solution[i]);
  if (solved) return "Puzzle complete. Every cell is correct.";
  if (changed.length > 1) return "Board updated.";
  const cell = changed[0]!;
  const value = next.board[cell]!;
  if (value === 0) return `Cleared ${where(cell)}.`;
  const clash = next.conflicts.has(cell) ? ` Conflict: ${value} repeats in a row, column or box.` : "";
  return `Placed ${value} at ${where(cell)}.${clash}`;
}

export const describeCheck = (mistakes: number) => `Check: ${checkMessage(mistakes)}.`;
