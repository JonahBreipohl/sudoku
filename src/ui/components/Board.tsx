import { boxOf, colOf, rowOf, type Grid } from "../../engine";

interface BoardProps {
  givens: Grid;
  board: Grid;
  selected: number | null;
  conflicts: ReadonlySet<number>;
  onSelect: (cell: number) => void;
}

function cellLabel(cell: number, value: number, given: boolean, conflict: boolean): string {
  const where = `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;
  const what = value === 0 ? "empty" : `${value}${given ? ", given" : ""}`;
  return `${where}, ${what}${conflict ? ", conflict" : ""}`;
}

export function Board({ givens, board, selected, conflicts, onSelect }: BoardProps) {
  const selValue = selected === null ? 0 : board[selected]!;
  const rows = Array.from({ length: 9 }, (_, r) => r);

  return (
    <div className="board" role="grid" aria-label="Sudoku board">
      {rows.map((r) => (
        <div className="board-row" role="row" key={r}>
          {rows.map((c) => {
            const cell = r * 9 + c;
            const value = board[cell]!;
            const given = givens[cell] !== 0;
            const conflict = conflicts.has(cell);
            const isSelected = cell === selected;
            const related =
              selected !== null &&
              !isSelected &&
              (rowOf(cell) === rowOf(selected) || colOf(cell) === colOf(selected) || boxOf(cell) === boxOf(selected));
            const sameDigit = selValue !== 0 && value === selValue && !isSelected;
            const classes = [
              "cell",
              given && "cell--given",
              isSelected && "cell--selected",
              related && "cell--related",
              sameDigit && "cell--same",
              conflict && "cell--conflict",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div role="gridcell" key={c} aria-selected={isSelected}>
                <button
                  type="button"
                  className={classes}
                  data-cell={cell}
                  aria-label={cellLabel(cell, value, given, conflict)}
                  tabIndex={isSelected || (selected === null && cell === 0) ? 0 : -1}
                  onClick={() => onSelect(cell)}
                >
                  {value !== 0 ? value : ""}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
