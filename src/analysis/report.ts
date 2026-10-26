// Assembles the mistake analysis of a record (docs/ARCHITECTURE.md, "Mistake analysis") into one
// plain-data report. It crosses the worker boundary, so it holds only JSON-safe values: no
// classes, maps, functions or undefined-only fields, and no per-event replay (the timeline
// replays the record itself).

import { defaultRegistry, fromGrid, nextStep, type Level, type Step, type TechniqueRegistry } from "../engine";
import type { GameRecord } from "../state/events";
import { findCascade, type CascadeMove } from "./cascade";
import { diagnose, type MistakeDiagnosis } from "./diagnose";
import { findMistakes } from "./mistakes";

export type { CascadeMove } from "./cascade";

export interface MistakeReport {
  /** Identifies the analysed record and path, so cached reports can be matched to it. */
  recordId: string;
  cursor: number;
  level: Level;
  /** Board events from the root to the cursor. */
  pathLength: number;
  /** Every mistake on the path, diagnosed, in play order. */
  mistakes: MistakeDiagnosis[];
  /** The first mistake, or null when the path has none. */
  root: MistakeDiagnosis | null;
  /**
   * What was available instead: nextStep at the state before the root, at the puzzle's level.
   * Null when there is no root or no step applies there.
   */
  alternative: Step | null;
  /** Later moves that depended on the root, in play order. Empty without a root. */
  cascade: CascadeMove[];
  /** Root cell first, then the cells that justify its diagnosis, for board highlighting. */
  highlight: number[];
}

function justificationCells(d: MistakeDiagnosis): number[] {
  const diagnosis = d.diagnosis;
  switch (diagnosis.kind) {
    case "consequence":
      return [diagnosis.wrongCell];
    case "conflict":
      return diagnosis.conflictCells;
    case "deduction":
      return diagnosis.step.cells;
    case "typo":
    case "guess":
      return [];
  }
}

/** Analyses the path ending at the record's cursor. Does not modify the record. */
export function analyzeMistakes(record: GameRecord, registry: TechniqueRegistry = defaultRegistry): MistakeReport {
  const scan = findMistakes(record);
  const mistakes = scan.mistakes.map((m) => diagnose(scan, m, record.level, registry));
  const root = mistakes[0] ?? null;
  // The board before the root holds no wrong value (the root is the first mistake), so this is
  // the true state the player was looking at.
  const alternative = scan.root ? nextStep(fromGrid(scan.root.before.board), record.level, registry) : null;
  const cascade = scan.root ? findCascade(scan, scan.root) : [];
  const highlight = root ? [...new Set([root.mistake.cell, ...justificationCells(root)])] : [];
  return {
    recordId: record.id,
    cursor: record.cursor,
    level: record.level,
    pathLength: scan.replay.path.length,
    mistakes,
    root,
    alternative,
    cascade,
    highlight,
  };
}
