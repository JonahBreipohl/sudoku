// Finds the mistakes on a record's path and the root mistake (docs/ARCHITECTURE.md,
// "Mistake analysis", step 2). Diagnosis and cascade build on this list.

import { digitBit, type Digit } from "../engine";
import type { GameRecord } from "../state/events";
import { replayRecord, type Replay, type ReplayState } from "./replay";

export type MistakeKind =
  /** A place or hint-reveal whose digit differs from the solution. */
  | "wrong-placement"
  /** A note edit that turned off the solution digit in an empty cell. */
  | "removed-solution-note";

export interface Mistake {
  kind: MistakeKind;
  /** Node id of the event in `record.nodes`. */
  eventId: number;
  /** Position of the event on the replayed path. */
  index: number;
  cell: number;
  /** The digit placed, or the note digit turned off. */
  digit: Digit;
  /** The solution digit of `cell`. */
  solutionDigit: Digit;
  /** The state before the event (S in the architecture doc). */
  before: ReplayState;
}

/** The raw mistake list; report.ts assembles it with diagnoses into the MistakeReport. */
export interface MistakeScan {
  replay: Replay;
  /** In play order. */
  mistakes: Mistake[];
  /** The first mistake, or null when there is none. */
  root: Mistake | null;
}

export function findMistakes(record: GameRecord): MistakeScan {
  const replay = replayRecord(record);
  const { givens, solution, path, states } = replay;
  const mistakes: Mistake[] = [];
  path.forEach((event, index) => {
    const before = states[index]!;
    if (event.type !== "place" && event.type !== "hint-reveal" && event.type !== "note") return;
    const cell = event.cell;
    // The reducer ignores edits to givens, so they cannot be mistakes.
    if (givens[cell] !== 0) return;
    const truth = solution[cell] as Digit;
    const digit = event.digit as Digit;
    let kind: MistakeKind | null = null;
    if (event.type === "note") {
      // Only an edit that actually turns the true digit off counts; an already-off note
      // or a note on a filled cell changes nothing.
      const bit = digitBit(truth);
      if (!event.on && digit === truth && before.board[cell] === 0 && (before.notes[cell]! & bit) !== 0)
        kind = "removed-solution-note";
    } else if (digit !== truth) {
      kind = "wrong-placement";
    }
    if (kind) mistakes.push({ kind, eventId: event.id, index, cell, digit, solutionDigit: truth, before });
  });
  return { replay, mistakes, root: mistakes[0] ?? null };
}
