// Classifies each mistake (docs/ARCHITECTURE.md, "Mistake analysis", steps 3 and 4). The checks
// run in the documented order and the first that matches wins.

import {
  PEERS,
  applyStep,
  cellName,
  defaultRegistry,
  digitBit,
  fromGrid,
  nextStep,
  type CandidateState,
  type CellValue,
  type Digit,
  type Level,
  type Step,
  type TechniqueRegistry,
} from "../engine";
import type { BoardEvent, GameRecord } from "../state/events";
import { findMistakes, type Mistake, type MistakeReport } from "./mistakes";

/** A placement this soon after the previous board event can be a slip of the finger. */
export const TYPO_WINDOW_MS = 1500;

/** Which physical layout a digit was entered on, for typo adjacency. */
export type InputLayout = "pad" | "number-row" | "numpad";

export type Diagnosis =
  /** A wrong value in a peer already holds this cell's solution digit, hiding the truth. */
  | { kind: "consequence"; wrongCell: number; wrongEventId: number | null }
  /** The digit was already placed in a peer, so the conflict was on the board. */
  | { kind: "conflict"; conflictCells: number[] }
  /** Entered quickly, on a key next to the solution digit. */
  | { kind: "typo"; intended: Digit; gapMs: number; layout: InputLayout }
  /**
   * No level-limited deduction resolved the cell: either nothing applied at S (`stepsTried` 0),
   * or logic stalled after that many steps without reaching it.
   */
  | { kind: "guess"; stepsTried: number }
  /**
   * The step that ruled the move out. `outcome` is "eliminated" when the step removed the
   * candidate (directly, or by placing in the cell or a peer), "placed" when it proved the
   * solution digit belongs in the cell (how a removed solution note is refuted).
   */
  | { kind: "deduction"; step: Step; stepsBefore: number; outcome: "eliminated" | "placed" };

export interface MistakeDiagnosis {
  mistake: Mistake;
  diagnosis: Diagnosis;
  /** What was available instead: the first step nextStep finds at S, or null. */
  available: Step | null;
  /** One line for the analysis panel. */
  summary: string;
}

// Positions as [row, col]. The on-screen pad reads 1-2-3 across the top; a numeric keypad puts
// 7-8-9 on top; the number row is a single line.
function position(layout: InputLayout, d: Digit): [number, number] {
  const r = Math.floor((d - 1) / 3);
  const c = (d - 1) % 3;
  if (layout === "pad") return [r, c];
  if (layout === "numpad") return [2 - r, c];
  return [0, d - 1];
}

/** Distinct digits whose keys touch, diagonals included (a thumb slips diagonally too). */
export function keysAdjacent(layout: InputLayout, a: Digit, b: Digit): boolean {
  if (a === b) return false;
  const [ra, ca] = position(layout, a);
  const [rb, cb] = position(layout, b);
  return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
}

/**
 * The layout the digit came from, or null when adjacency says nothing: in digit-first entry the
 * digit was chosen before the cell tap, so a quick wrong tap misses a cell, not a key.
 */
export function inputLayout(event: BoardEvent): InputLayout | null {
  if (event.type !== "place") return null;
  if (event.input === "pad") return "pad";
  if (event.input === "keyboard") return event.key && /^Numpad/.test(event.key) ? "numpad" : "number-row";
  return null;
}

/** The board with wrong values dropped, so deductions from it are sound. */
function correctOnly(board: readonly CellValue[], solution: readonly CellValue[]): CellValue[] {
  return board.map((v, i) => (v !== 0 && v === solution[i] ? v : 0));
}

/** Node id of the last event before `index` that put a value in `cell`. */
function lastPlacementAt(path: readonly BoardEvent[], index: number, cell: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const e = path[i]!;
    if ((e.type === "place" || e.type === "hint-reveal") && e.cell === cell) return e.id;
  }
  return null;
}

/** Steps along the level-limited solve from `start` until (cell, digit) is resolved. */
function findRuling(
  start: CandidateState,
  cell: number,
  digit: Digit,
  level: Level,
  registry: TechniqueRegistry,
): { step: Step; stepsBefore: number; outcome: "eliminated" | "placed" } | { stalledAfter: number } {
  const bit = digitBit(digit);
  let state = start;
  if (state.values[cell] !== 0) throw new Error(`findRuling: ${cellName(cell)} must start empty`);
  for (let n = 0; ; n++) {
    const step = nextStep(state, level, registry);
    if (!step) return { stalledAfter: n };
    state = applyStep(state, step);
    if (state.values[cell] !== 0) {
      return { step, stepsBefore: n, outcome: state.values[cell] === digit ? "placed" : "eliminated" };
    }
    if ((state.candidates[cell]! & bit) === 0) return { step, stepsBefore: n, outcome: "eliminated" };
  }
}

function summarize(m: Mistake, d: Diagnosis): string {
  const at = cellName(m.cell);
  const move = m.kind === "wrong-placement" ? `${m.digit} in ${at}` : `removing the ${m.digit} note in ${at}`;
  switch (d.kind) {
    case "consequence":
      return `${move} followed from the wrong ${m.solutionDigit} in ${cellName(d.wrongCell)}.`;
    case "conflict":
      return `${move} clashed with the ${m.digit} already in ${d.conflictCells.map(cellName).join(", ")}.`;
    case "typo":
      return `${move} looks like a slip: ${m.digit} sits next to ${d.intended}, entered ${(d.gapMs / 1000).toFixed(1)} s after the previous move.`;
    case "guess":
      return `${move} was a guess: no deduction at this level settled ${at}.`;
    case "deduction": {
      const lead = d.stepsBefore === 0 ? "The next step" : `After ${d.stepsBefore} step${d.stepsBefore === 1 ? "" : "s"}, a step`;
      return `${move} could be ruled out. ${lead} shows it: ${d.step.explanation}.`;
    }
  }
}

/** Diagnoses one mistake from `report` at the puzzle's level. Does not modify its inputs. */
export function diagnose(
  report: MistakeReport,
  mistake: Mistake,
  level: Level,
  registry: TechniqueRegistry = defaultRegistry,
): MistakeDiagnosis {
  const { solution, path } = report.replay;
  const { cell, digit, solutionDigit, before, index } = mistake;
  const board = before.board;
  const event = path[index]!;
  const peers = PEERS[cell]!;

  // The cell itself starts empty: a placement can overwrite a correct value there, and leaving it
  // in would make the cell look settled before any step ran.
  const known = correctOnly(board, solution);
  known[cell] = 0;
  const start = fromGrid(known);
  const available = nextStep(start, level, registry);
  const result = (diagnosis: Diagnosis): MistakeDiagnosis => ({
    mistake,
    diagnosis,
    available,
    summary: summarize(mistake, diagnosis),
  });

  // 1. Consequence: an earlier wrong value in a peer occupies this cell's solution digit.
  const wrongCell = peers.find((p) => board[p] === solutionDigit && solution[p] !== solutionDigit);
  if (wrongCell !== undefined) {
    return result({ kind: "consequence", wrongCell, wrongEventId: lastPlacementAt(path, index, wrongCell) });
  }

  if (mistake.kind === "wrong-placement") {
    // 2. Conflict: the placed digit is already visible in a peer.
    const conflictCells = peers.filter((p) => board[p] === digit);
    if (conflictCells.length > 0) return result({ kind: "conflict", conflictCells: [...conflictCells].sort((a, b) => a - b) });

    // 3. Typo: quick, and on a key touching the solution digit.
    const layout = inputLayout(event);
    const previous = path[index - 1];
    if (layout && previous) {
      const gapMs = event.at - previous.at;
      if (gapMs >= 0 && gapMs < TYPO_WINDOW_MS && keysAdjacent(layout, digit, solutionDigit)) {
        return result({ kind: "typo", intended: solutionDigit, gapMs, layout });
      }
    }
  }

  // 4. Guess: nothing applies at S. 5. Deduction: the step that settles (cell, digit).
  if (!available) return result({ kind: "guess", stepsTried: 0 });
  const ruling = findRuling(start, cell, digit, level, registry);
  if ("stalledAfter" in ruling) return result({ kind: "guess", stepsTried: ruling.stalledAfter });
  return result({ kind: "deduction", ...ruling });
}

/** Every mistake on the record's path, diagnosed in play order. */
export function diagnoseRecord(
  record: GameRecord,
  registry: TechniqueRegistry = defaultRegistry,
): { report: MistakeReport; diagnoses: MistakeDiagnosis[] } {
  const report = findMistakes(record);
  const diagnoses = report.mistakes.map((m) => diagnose(report, m, record.level, registry));
  return { report, diagnoses };
}
