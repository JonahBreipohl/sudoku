import { useEffect, useRef, useState } from "react";
import { DIGITS, type Digit, type Grid } from "../../engine";
import { pad } from "../strings";

interface PadProps {
  board: Grid;
  onDigit: (digit: Digit) => void;
  onErase: () => void;
  /** Digits enter notes rather than values; shown on the pad itself. */
  notesMode?: boolean;
  /** Digit locked in digit-first entry. */
  lockedDigit?: Digit | null;
}

/** Index d holds how many of digit d are still to place (index 0 unused). */
export function remainingCounts(board: Grid): number[] {
  const placed = new Array<number>(10).fill(0);
  for (const v of board) placed[v]!++;
  return placed.map((n) => Math.max(0, 9 - n));
}

/** Digits with exactly nine copies and none sharing a row, column or box. */
export function finishedDigits(board: Grid): Set<number> {
  const rows = new Set<number>();
  const cols = new Set<number>();
  const boxes = new Set<number>();
  const count = new Array<number>(10).fill(0);
  const bad = new Set<number>();
  board.forEach((v, i) => {
    if (v === 0) return;
    count[v]!++;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const keys = [
      [rows, r * 10 + v],
      [cols, c * 10 + v],
      [boxes, (Math.floor(r / 3) * 3 + Math.floor(c / 3)) * 10 + v],
    ] as const;
    for (const [set, k] of keys) {
      if (set.has(k)) bad.add(v);
      set.add(k);
    }
  });
  const out = new Set<number>();
  for (let d = 1; d <= 9; d++) if (count[d] === 9 && !bad.has(d)) out.add(d);
  return out;
}

export function Pad({ board, onDigit, onErase, notesMode = false, lockedDigit = null }: PadProps) {
  const counts = remainingCounts(board);
  const finished = finishedDigits(board);
  const prev = useRef(finished);
  const [flourish, setFlourish] = useState<ReadonlySet<number>>(new Set());
  // Count fades only after the first paint, so loading a game does not animate.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const finishedKey = [...finished].join();
  useEffect(() => {
    const fresh = [...finished].filter((d) => !prev.current.has(d));
    prev.current = finished;
    if (fresh.length > 0) setFlourish((f) => new Set([...f, ...fresh]));
    // finishedKey stands in for the set, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey]);

  return (
    <div
      className={notesMode ? "pad pad--notes" : "pad"}
      role="group"
      aria-label={notesMode ? pad.notesGroup : pad.group}
    >
      {DIGITS.map((d) => {
        const remaining = counts[d]!;
        return (
          <button
            type="button"
            key={d}
            className={["pad-key", remaining === 0 && "pad-key--done", lockedDigit === d && "pad-key--locked", flourish.has(d) && "pad-key--flourish"]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={lockedDigit === null ? undefined : lockedDigit === d}
            onClick={() => onDigit(d)}
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              setFlourish((f) => {
                const n = new Set(f);
                n.delete(d);
                return n;
              });
            }}
          >
            {/* The accessible name comes from the content: "4, 7 remaining" or "4, complete". */}
            <span className="pad-digit">{d}</span>
            <span className="pad-count" key={remaining} data-fade={ready ? "" : undefined}>
              <span className="sr-only">, </span>
              <span aria-hidden="true">
                {remaining === 0 ? "\u2713" : remaining}
              </span>
              <span className="sr-only">
                {remaining === 0 ? pad.complete : pad.remaining(remaining)}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="pad-key pad-key--erase"
        aria-label={pad.erase}
        onClick={onErase}
      >
        <span className="pad-digit" aria-hidden="true">
          ⌫
        </span>
      </button>
    </div>
  );
}
