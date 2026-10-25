import { memo, useEffect } from "react";
import { maskDigits, colOf, rowOf, type CandidateMask } from "../../engine";
import { recordCellCommit } from "../renderProbe";

export interface CellProps {
  cell: number;
  value: number;
  given: boolean;
  notes: CandidateMask;
  selected: boolean;
  related: boolean;
  sameDigit: boolean;
  noteDigit: number;
  conflict: boolean;
  /** Marked wrong by the last Check (only passed when the setting is on). */
  wrong?: boolean;
  tabbable: boolean;
  onSelect: (cell: number) => void;
}

export function cellLabel(cell: number, value: number, given: boolean, notes: CandidateMask, conflict: boolean, wrong = false): string {
  const where = `Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`;
  let what: string;
  if (value !== 0) what = `${value}${given ? ", given" : ""}`;
  else {
    const digits = maskDigits(notes);
    what = digits.length > 0 ? `empty, notes ${digits.join(" ")}` : "empty";
  }
  return `${where}, ${what}${conflict ? ", conflict" : ""}${wrong ? ", wrong" : ""}`;
}

const NOTE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// Memoized on primitive props so a placement re-renders only the cells whose view changed.
export const Cell = memo(function Cell(p: CellProps) {
  useEffect(() => recordCellCommit(p.cell));
  const classes = [
    "cell",
    p.given ? "cell--given" : p.value !== 0 ? "cell--entry" : p.notes !== 0 ? "cell--noted" : "",
    p.selected && "cell--selected",
    p.related && "cell--related",
    p.sameDigit && "cell--same",
    p.conflict && "cell--conflict",
    p.wrong && "cell--wrong",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      data-cell={p.cell}
      aria-label={cellLabel(p.cell, p.value, p.given, p.notes, p.conflict, p.wrong)}
      tabIndex={p.tabbable ? 0 : -1}
      onClick={() => p.onSelect(p.cell)}
    >
      {p.value !== 0 ? (
        p.value
      ) : p.notes !== 0 ? (
        <span className="notes" aria-hidden="true">
          {NOTE_SLOTS.map((d) => (
            <span key={d} className={p.noteDigit === d ? "note note--match" : "note"}>
              {p.notes & (1 << (d - 1)) ? d : ""}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});
