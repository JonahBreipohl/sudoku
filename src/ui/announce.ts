import type { Grid } from "../engine";
import { checkMessage } from "../state/check";

export interface BoardView {
  board: Grid;
  conflicts: ReadonlySet<number>;
}

const where = (cell: number) => `row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`;

/**
 * Screen-reader sentence for a board change, or null when nothing worth saying changed
 * (note edits, no-ops). Completion is not diffed here; it is announced from the submit event. Multi-cell changes (undo, reset) get one summary, not a per-cell flood.
 */
export function describeChange(prev: BoardView, next: BoardView): string | null {
  const changed: number[] = [];
  for (let i = 0; i < 81; i++) if (prev.board[i] !== next.board[i]) changed.push(i);
  if (changed.length === 0) return null;
  if (changed.length > 1) return "Board updated.";
  const cell = changed[0]!;
  const value = next.board[cell]!;
  if (value === 0) return `Cleared ${where(cell)}.`;
  const clash = next.conflicts.has(cell) ? ` Conflict: ${value} repeats in a row, column or box.` : "";
  return `Placed ${value} at ${where(cell)}.${clash}`;
}

export const describeCheck = (mistakes: number) => `Check: ${checkMessage(mistakes)}.`;

export const describeSubmit = (result: "solved" | "incorrect") =>
  result === "solved" ? "Puzzle complete. Every cell is correct." : "Submitted. The board has mistakes.";
