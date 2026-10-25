// "Am I on track?" (docs/ARCHITECTURE.md, check meta event). Compares the player's entries
// with the stored solution; only counts and cell indices leave this module, never digits.

import type { GameRecord } from "./events";

/** Non-given cells whose entered digit differs from the solution. Empty cells are not wrong. */
export function wrongCells(puzzle: string, solution: string, board: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 81; i++) {
    const v = board[i] ?? 0;
    if (v === 0 || (puzzle[i] !== "0" && puzzle[i] !== ".")) continue;
    if (String(v) !== solution[i]) out.push(i);
  }
  return out;
}

export function checkBoard(record: Pick<GameRecord, "puzzle" | "solution">, board: readonly number[]) {
  const wrong = wrongCells(record.puzzle, record.solution, board);
  return { mistakes: wrong.length, wrong };
}

/** Screen-reader and visible summary; deliberately says nothing about which digits are right. */
export function checkMessage(mistakes: number): string {
  if (mistakes === 0) return "On track";
  return mistakes === 1 ? "1 error" : `${mistakes} errors`;
}
