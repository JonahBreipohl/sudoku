import { maskDigits } from "../../engine";
import { cellLabel } from "../components/Cell";
import { useGame } from "../useGame";

const IDX = Array.from({ length: 9 }, (_, i) => i);
const NOTE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Read-only render of the current game. Not interactive: cells are plain, unfocusable divs. */
export function DisplayBoard() {
  const { game } = useGame();
  return (
    <div className="dboard" role="grid" aria-label="Current game, read only" aria-readonly="true">
      {IDX.map((r) => (
        <div className="dboard-row" role="row" key={r}>
          {IDX.map((c) => {
            const cell = r * 9 + c;
            const value = game.board[cell]!;
            const given = game.givens[cell] !== 0;
            const notes = game.notes[cell] ?? 0;
            const conflict = game.conflicts.has(cell);
            const cls = ["dcell", given ? "dcell--given" : value !== 0 ? "dcell--entry" : "", conflict && "dcell--conflict"]
              .filter(Boolean)
              .join(" ");
            return (
              <div role="gridcell" key={c} className={cls} data-cell={cell} aria-label={cellLabel(cell, value, given, notes, conflict)}>
                {value !== 0 ? (
                  value
                ) : notes !== 0 ? (
                  <span className="dnotes" aria-hidden="true">
                    {NOTE_SLOTS.map((d) => (
                      <span key={d}>{maskDigits(notes).includes(d) ? d : ""}</span>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
