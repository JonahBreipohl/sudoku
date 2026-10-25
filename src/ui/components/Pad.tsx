import { DIGITS, type Digit, type Grid } from "../../engine";

interface PadProps {
  board: Grid;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
}

/** Index d holds how many of digit d are still to place (index 0 unused). */
export function remainingCounts(board: Grid): number[] {
  const placed = new Array<number>(10).fill(0);
  for (const v of board) placed[v]!++;
  return placed.map((n) => Math.max(0, 9 - n));
}

export function Pad({ board, onDigit, onErase }: PadProps) {
  const counts = remainingCounts(board);

  return (
    <div className="pad" role="group" aria-label="Number pad">
      {DIGITS.map((d) => {
        const remaining = counts[d]!;
        return (
          <button
            type="button"
            key={d}
            className={remaining === 0 ? "pad-key pad-key--done" : "pad-key"}
            onClick={() => onDigit(d)}
          >
            {/* The accessible name comes from the content: "4, 7 remaining" or "4, complete". */}
            <span className="pad-digit">{d}</span>
            <span className="pad-count">
              <span className="sr-only">, </span>
              <span aria-hidden="true">
                {remaining === 0 ? "\u2713" : remaining}
              </span>
              <span className="sr-only">
                {remaining === 0 ? "complete" : `${remaining} remaining`}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="pad-key pad-key--erase"
        aria-label="Erase"
        onClick={onErase}
      >
        <span className="pad-digit" aria-hidden="true">
          ⌫
        </span>
      </button>
    </div>
  );
}
