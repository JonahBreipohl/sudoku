import { maskDigits } from "../../engine";
import { cellLabel } from "../components/Cell";
import { useGame } from "../useGame";

const IDX = Array.from({ length: 9 }, (_, i) => i);
const NOTE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Read-only render of the current game. Not interactive: cells are plain, unfocusable divs. */
export function DisplayBoard() {
  const { game } = useGame();
  return (
    <BoardView
      label="Current game, read only"
      board={game.board}
      givens={game.givens}
      notes={game.notes}
      conflicts={game.conflicts}
    />
  );
}

export interface BoardViewProps {
  label: string;
  board: readonly number[];
  givens: readonly number[];
  notes: readonly number[];
  conflicts?: ReadonlySet<number>;
  /** Cells to outline (the watch puzzle's current step). */
  marked?: ReadonlySet<number>;
}

export function BoardView({
  label,
  board,
  givens,
  notes: allNotes,
  conflicts,
  marked,
}: BoardViewProps) {
  return (
    <div className="dboard" role="grid" aria-label={label} aria-readonly="true">
      {IDX.map((r) => (
        <div className="dboard-row" role="row" key={r}>
          {IDX.map((c) => {
            const cell = r * 9 + c;
            const value = board[cell]!;
            const given = givens[cell] !== 0;
            const notes = allNotes[cell] ?? 0;
            const noted = value === 0 && notes !== 0;
            const conflict = conflicts?.has(cell) ?? false;
            const cls = [
              "dcell",
              given ? "dcell--given" : value !== 0 ? "dcell--entry" : "",
              conflict && "dcell--conflict",
              marked?.has(cell) && "dcell--step",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                role="gridcell"
                key={c}
                className={cls}
                data-cell={cell}
                // Noted cells are named from content (hidden prefix + visible digits) so the visible text is part of the name.
                aria-label={
                  noted
                    ? undefined
                    : cellLabel(cell, value, given, notes, conflict)
                }
              >
                {value !== 0 ? (
                  value
                ) : noted ? (
                  <>
                    <span className="sr-only">{`${cellLabel(cell, 0, false, 0, conflict)}, notes`}</span>
                    <span className="dnotes">
                      {NOTE_SLOTS.map((d) => (
                        <span key={d}>
                          {maskDigits(notes).includes(d) ? d : ""}
                        </span>
                      ))}
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
