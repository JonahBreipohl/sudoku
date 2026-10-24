import { eliminate, place, type CandidateState } from "./candidates";
import { colOf, rowOf, type Digit } from "./grid";

export type Level = "easy" | "medium" | "hard" | "expert" | "master";

export const LEVELS: readonly Level[] = ["easy", "medium", "hard", "expert", "master"];

export type TechniqueId =
  | "naked-single"
  | "hidden-single"
  | "pointing"
  | "claiming"
  | "naked-pair"
  | "hidden-pair"
  | "naked-triple"
  | "hidden-triple"
  | "naked-quad"
  | "hidden-quad"
  | "x-wing"
  | "swordfish"
  | "xy-wing"
  | "xyz-wing"
  | "simple-coloring"
  | "x-chain"
  | "xy-chain"
  | "w-wing"
  | "unique-rectangle";

export interface Technique {
  id: TechniqueId;
  name: string;
  level: Level;
  /** Score contribution per step; see the tier table in docs/ARCHITECTURE.md. */
  weight: number;
}

/** Ordered cheapest first, which is the order the driver tries them in. */
export const TECHNIQUES: readonly Technique[] = [
  { id: "naked-single", name: "Naked Single", level: "easy", weight: 1 },
  { id: "hidden-single", name: "Hidden Single", level: "easy", weight: 1.5 },
  { id: "pointing", name: "Pointing", level: "medium", weight: 4 },
  { id: "claiming", name: "Claiming", level: "medium", weight: 4 },
  { id: "naked-pair", name: "Naked Pair", level: "medium", weight: 6 },
  { id: "hidden-pair", name: "Hidden Pair", level: "medium", weight: 8 },
  { id: "naked-triple", name: "Naked Triple", level: "hard", weight: 12 },
  { id: "hidden-triple", name: "Hidden Triple", level: "hard", weight: 16 },
  { id: "naked-quad", name: "Naked Quad", level: "hard", weight: 20 },
  { id: "hidden-quad", name: "Hidden Quad", level: "hard", weight: 25 },
  { id: "x-wing", name: "X-Wing", level: "expert", weight: 30 },
  { id: "swordfish", name: "Swordfish", level: "expert", weight: 45 },
  { id: "xy-wing", name: "XY-Wing", level: "expert", weight: 40 },
  { id: "xyz-wing", name: "XYZ-Wing", level: "expert", weight: 50 },
  { id: "simple-coloring", name: "Simple Coloring", level: "expert", weight: 45 },
  { id: "x-chain", name: "X-Chain", level: "master", weight: 60 },
  { id: "xy-chain", name: "XY-Chain", level: "master", weight: 70 },
  { id: "w-wing", name: "W-Wing", level: "master", weight: 55 },
  { id: "unique-rectangle", name: "Unique Rectangle", level: "master", weight: 50 },
];

export function techniqueInfo(id: TechniqueId): Technique {
  const t = TECHNIQUES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown technique: ${id}`);
  return t;
}

export interface Step {
  technique: TechniqueId;
  placements: { cell: number; digit: Digit }[];
  eliminations: { cell: number; digit: Digit }[];
  /** Cells that justify the step (highlight these). */
  cells: number[];
  digits: Digit[];
  /** Unit indices (0-8 rows, 9-17 columns, 18-26 boxes) involved, when relevant. */
  units?: number[];
  /**
   * Disjoint cell groups the UI shows in distinct styles, when the step has more than one role
   * for its cells (simple coloring: the two colors of the chain, in that order).
   */
  groups?: number[][];
  /** One line, e.g. "Only r3c5 in row 3 can hold 7". */
  explanation: string;
}

/** Applies eliminations first, then placements (a placement also clears peers' candidates). */
export function applyStep(state: CandidateState, step: Step): CandidateState {
  let next = state;
  for (const { cell, digit } of step.eliminations) next = eliminate(next, cell, digit);
  for (const { cell, digit } of step.placements) next = place(next, cell, digit);
  return next;
}

/** "r3c5" for a cell index (1-based row and column). */
export const cellName = (cell: number): string => `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;

/** "row 3", "column 5" or "box 2" for a unit index; boxes number 1-9 in reading order. */
export function unitName(unit: number): string {
  if (!Number.isInteger(unit) || unit < 0 || unit > 26) throw new RangeError(`Bad unit index: ${unit}`);
  if (unit < 9) return `row ${unit + 1}`;
  if (unit < 18) return `column ${unit - 9 + 1}`;
  return `box ${unit - 18 + 1}`;
}

/** "3", "3 and 5", "3, 5 and 7"; sorted ascending, duplicates dropped. */
export function formatDigits(digits: readonly number[]): string {
  const list = [...new Set(digits)].sort((a, b) => a - b).map(String);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
