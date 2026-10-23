import { DIGITS, type Digit, type Grid } from "../../engine";

interface PadProps {
  board: Grid;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
}

export function Pad({ board, onDigit, onErase }: PadProps) {
  const placed = new Array<number>(10).fill(0);
  for (const v of board) placed[v]!++;

  return (
    <div className="pad" role="group" aria-label="Number pad">
      {DIGITS.map((d) => {
        const remaining = Math.max(0, 9 - placed[d]!);
        return (
          <button
            type="button"
            key={d}
            className={remaining === 0 ? "pad-key pad-key--done" : "pad-key"}
            onClick={() => onDigit(d)}
          >
            {/* The accessible name comes from the content: "4, 7 remaining". */}
            <span className="pad-digit">{d}</span>
            <span className="pad-count">
              <span className="sr-only">, </span>
              {remaining}
              <span className="sr-only"> remaining</span>
            </span>
          </button>
        );
      })}
      <button type="button" className="pad-key pad-key--erase" aria-label="Erase" onClick={onErase}>
        <span className="pad-digit" aria-hidden="true">
          ⌫
        </span>
      </button>
    </div>
  );
}
