import { type CandidateMask, type Grid } from "../../engine";
import { highlightsFor } from "../highlight";
import { Cell } from "./Cell";

interface BoardProps {
  givens: Grid;
  board: Grid;
  notes: readonly CandidateMask[];
  selected: number | null;
  conflicts: ReadonlySet<number>;
  onSelect: (cell: number) => void;
}

const ROWS = Array.from({ length: 9 }, (_, i) => i);

export function Board({ givens, board, notes, selected, conflicts, onSelect }: BoardProps) {
  const highlights = highlightsFor({ board, notes, conflicts }, selected);

  return (
    <div className="board" role="grid" aria-label="Sudoku board">
      {ROWS.map((r) => (
        <div className="board-row" role="row" key={r}>
          {ROWS.map((c) => {
            const cell = r * 9 + c;
            const value = board[cell]!;
            const hl = highlights[cell]!;
            const isSelected = hl.selected;
            return (
              <div role="gridcell" key={c} aria-selected={isSelected}>
                <Cell
                  cell={cell}
                  value={value}
                  given={givens[cell] !== 0}
                  notes={notes[cell] ?? 0}
                  selected={isSelected}
                  related={hl.related}
                  sameDigit={hl.sameDigit}
                  noteDigit={hl.noteDigit}
                  conflict={hl.conflict}
                  tabbable={isSelected || (selected === null && cell === 0)}
                  onSelect={onSelect}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
