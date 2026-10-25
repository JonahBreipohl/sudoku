import { boxOf, colOf, rowOf, type CandidateMask, type Grid } from "../engine";

export interface HighlightInput {
  board: Grid;
  notes: readonly CandidateMask[];
  conflicts: ReadonlySet<number>;
}

export interface CellHighlight {
  selected: boolean;
  /** Shares a row, column or box with the selection (excluding the selection). */
  related: boolean;
  /** Placed digit equals the selected cell's digit. */
  sameDigit: boolean;
  /** Notes in this empty cell contain the selected digit; the Cell emphasizes that note. */
  noteDigit: number;
  conflict: boolean;
}

const NONE: CellHighlight = { selected: false, related: false, sameDigit: false, noteDigit: 0, conflict: false };

/** Pure per-cell highlight flags for the current selection; the selection never mutates game state. */
export function highlightsFor(state: HighlightInput, selection: number | null, locked: number | null = null): CellHighlight[] {
  // A locked digit (digit-first entry) takes over from the selected cell's digit.
  const digit = locked ?? (selection === null ? 0 : (state.board[selection] ?? 0));
  const bit = digit === 0 ? 0 : 1 << (digit - 1);
  const out: CellHighlight[] = [];
  for (let cell = 0; cell < 81; cell++) {
    const conflict = state.conflicts.has(cell);
    const value = state.board[cell] ?? 0;
    const isSelected = cell === selection;
    const related =
      selection !== null &&
      !isSelected &&
      (rowOf(cell) === rowOf(selection) || colOf(cell) === colOf(selection) || boxOf(cell) === boxOf(selection));
    const sameDigit = digit !== 0 && (locked !== null || !isSelected) && value === digit;
    const noteDigit = bit !== 0 && value === 0 && ((state.notes[cell] ?? 0) & bit) !== 0 ? digit : 0;
    out.push(
      !isSelected && !related && !sameDigit && noteDigit === 0 && !conflict
        ? NONE
        : { selected: isSelected, related, sameDigit, noteDigit, conflict },
    );
  }
  return out;
}
