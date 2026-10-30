import { memo, useEffect, useRef } from "react";
import { maskDigits, colOf, rowOf, type CandidateMask } from "../../engine";
import { recordCellCommit } from "../renderProbe";
import { cellLabels } from "../strings";

export type CellMark = "root" | "support" | "hint" | "hint-unit";

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
  /** Analysis highlight: the root mistake or a cell that justifies its diagnosis. */
  mark?: CellMark;
  tabbable: boolean;
  onSelect: (cell: number) => void;
}

export function cellLabel(cell: number, value: number, given: boolean, notes: CandidateMask, conflict: boolean, wrong = false, mark?: CellMark): string {
  const where = cellLabels.position(rowOf(cell) + 1, colOf(cell) + 1);
  let what: string;
  if (value !== 0) what = `${value}${given ? `, ${cellLabels.given}` : ""}`;
  else {
    const digits = maskDigits(notes);
    what = digits.length > 0 ? `${cellLabels.empty}, ${cellLabels.notes(digits.join(" "))}` : cellLabels.empty;
  }
  return `${where}, ${what}${conflict ? `, ${cellLabels.conflict}` : ""}${wrong ? `, ${cellLabels.wrong}` : ""}${mark === "root" ? `, ${cellLabels.mistake}` : mark === "support" ? `, ${cellLabels.reasonForMistake}` : ""}`;
}

const NOTE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// Memoized on primitive props so a placement re-renders only the cells whose view changed.
export const Cell = memo(function Cell(p: CellProps) {
  useEffect(() => recordCellCommit(p.cell));
  // Previous committed view, so animation plays only for a change in this cell, never on mount.
  const prev = useRef({ value: p.value, notes: p.notes, conflict: p.conflict });
  const pv = prev.current;
  const popped = p.value !== 0 && !p.given && p.value !== pv.value;
  const shaken = p.value !== 0 && !p.given && p.conflict && (popped || !pv.conflict);
  const addedNotes = p.value === 0 ? p.notes & ~pv.notes : 0;
  useEffect(() => {
    prev.current = { value: p.value, notes: p.notes, conflict: p.conflict };
  });
  const classes = [
    "cell",
    p.given ? "cell--given" : p.value !== 0 ? "cell--entry" : p.notes !== 0 ? "cell--noted" : "",
    p.selected && "cell--selected",
    p.related && "cell--related",
    p.sameDigit && "cell--same",
    p.conflict && "cell--conflict",
    shaken && "cell--shake",
    p.wrong && "cell--wrong",
    p.mark && `cell--mark-${p.mark}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      data-cell={p.cell}
      aria-label={cellLabel(p.cell, p.value, p.given, p.notes, p.conflict, p.wrong, p.mark)}
      tabIndex={p.tabbable ? 0 : -1}
      onClick={() => p.onSelect(p.cell)}
    >
      {p.value !== 0 ? (
        <span key={p.value} className={popped ? "digit digit--pop" : "digit"} data-pop={popped ? "" : undefined}>
          {p.value}
        </span>
      ) : p.notes !== 0 ? (
        <span className="notes" aria-hidden="true">
          {NOTE_SLOTS.map((d) => (
            <span key={d} className={`${p.noteDigit === d ? "note note--match" : "note"}${addedNotes & (1 << (d - 1)) ? " note--in" : ""}`}>
              {p.notes & (1 << (d - 1)) ? d : ""}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});
