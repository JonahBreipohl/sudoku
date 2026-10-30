import type { CSSProperties } from "react";
import { type CandidateMask, type Grid } from "../../engine";
import { highlightsFor } from "../highlight";
import { Cell, type CellMark } from "./Cell";
import { boardLabels } from "../strings";
import { rippleRings } from "../ripple";

interface BoardProps {
  givens: Grid;
  board: Grid;
  notes: readonly CandidateMask[];
  selected: number | null;
  conflicts: ReadonlySet<number>;
  /** Cells to mark wrong after a Check; empty when highlighting is off. */
  wrong?: ReadonlySet<number>;
  /** Analysis highlight: root mistake cell and the cells that justify its diagnosis. */
  marks?: ReadonlyMap<number, CellMark>;
  onSelect: (cell: number) => void;
  /** Digit locked in digit-first entry; highlighted wherever it appears. */
  lockedDigit?: number | null;
  /** Marks the grid as a read-only preview of another position. */
  preview?: boolean;
  /** Plays the one-shot completion animation (CSS only, skipped under reduced motion). */
  solved?: boolean;
  /** Cells to sweep after a move completed a unit: cell to stagger step; phase restarts the animation. */
  /** Last placed cell; the completion ripple radiates outward from it. */
  rippleOrigin?: number | null;
  sweep?: { order: ReadonlyMap<number, number>; phase: 0 | 1 } | null;
}

const ROWS = Array.from({ length: 9 }, (_, i) => i);

export function Board({ givens, board, notes, selected, conflicts, wrong, marks, onSelect, lockedDigit = null, preview = false, solved = false, rippleOrigin = null, sweep = null }: BoardProps) {
  const highlights = highlightsFor({ board, notes, conflicts }, selected, lockedDigit);

  const rings = solved ? rippleRings(rippleOrigin ?? 40) : null;

  return (
    <div className="board" role="grid" aria-label={preview ? boardLabels.preview : boardLabels.grid}
      data-preview={preview ? "" : undefined} data-solved={solved ? "" : undefined}>
      {ROWS.map((r) => (
        <div className="board-row" role="row" key={r}>
          {ROWS.map((c) => {
            const cell = r * 9 + c;
            const value = board[cell]!;
            const hl = highlights[cell]!;
            const isSelected = hl.selected;
            return (
              <div role="gridcell" key={c} aria-selected={isSelected}
                data-sweep={sweep?.order.has(cell) ? sweep.phase : undefined}
                style={{
                  ...(sweep?.order.has(cell) ? { "--sweep-i": sweep.order.get(cell) } : null),
                  ...(rings ? { "--ring": rings[cell] } : null),
                } as CSSProperties}>
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
                  wrong={wrong?.has(cell) ?? false}
                  mark={marks?.get(cell)}
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
