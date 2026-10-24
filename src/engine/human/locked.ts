import type { CandidateState } from "../candidates";
import { DIGITS, UNITS, boxOf, colOf, digitBit, rowOf, type Digit } from "../grid";
import { unitName, type Step } from "../step";
import { registerTechnique } from "./registry";

const ROW_UNITS = Array.from({ length: 9 }, (_, i) => i);
const COL_UNITS = Array.from({ length: 9 }, (_, i) => 9 + i);
const BOX_UNITS = Array.from({ length: 9 }, (_, i) => 18 + i);

/** Empty cells of a unit that still hold `digit` as a candidate, in unit order. */
function spotsOf(state: CandidateState, unit: number, digit: Digit): number[] {
  const bit = digitBit(digit);
  return UNITS[unit]!.filter((c) => state.values[c] === 0 && ((state.candidates[c] ?? 0) & bit) !== 0);
}

/** The single unit index all cells share under `unitOf`, or null when they span more than one. */
function sharedUnit(cells: readonly number[], unitOf: (cell: number) => number): number | null {
  const first = unitOf(cells[0]!);
  return cells.every((c) => unitOf(c) === first) ? first : null;
}

/**
 * Both techniques reduce to the same move: every candidate of `digit` in `source` lies inside
 * `target`, so `digit` must land in their intersection and can be cleared from the rest of
 * `target`. Returns null when that clears nothing.
 */
function lockedStep(
  state: CandidateState,
  technique: "pointing" | "claiming",
  digit: Digit,
  source: number,
  target: number,
  spots: number[],
): Step | null {
  const inSource = new Set(UNITS[source]!);
  const eliminations = spotsOf(state, target, digit)
    .filter((c) => !inSource.has(c))
    .map((cell) => ({ cell, digit }));
  if (eliminations.length === 0) return null;
  const s = unitName(source);
  const t = unitName(target);
  return {
    technique,
    placements: [],
    eliminations,
    cells: spots,
    digits: [digit],
    units: [source, target],
    explanation: `In ${s}, ${digit} is only in ${t}, so remove ${digit} from ${t} outside ${s}`,
  };
}

/**
 * Pointing (box to line): the first box, then digit, whose candidates all sit in one row or
 * column, with eliminations along that line outside the box. units is [box, line].
 * Two or more spots are required; a lone spot is a hidden single, which the driver prefers.
 */
export function findPointing(state: CandidateState): Step | null {
  for (const box of BOX_UNITS) {
    for (const digit of DIGITS) {
      const spots = spotsOf(state, box, digit);
      if (spots.length < 2) continue;
      const row = sharedUnit(spots, rowOf);
      const col = sharedUnit(spots, colOf);
      const line = row !== null ? row : col !== null ? 9 + col : null;
      if (line === null) continue;
      const step = lockedStep(state, "pointing", digit, box, line, spots);
      if (step) return step;
    }
  }
  return null;
}

/**
 * Claiming (line to box): the first row, then column, then digit, whose candidates all sit in
 * one box, with eliminations in that box outside the line. units is [line, box].
 */
export function findClaiming(state: CandidateState): Step | null {
  for (const line of [...ROW_UNITS, ...COL_UNITS]) {
    for (const digit of DIGITS) {
      const spots = spotsOf(state, line, digit);
      if (spots.length < 2) continue;
      const box = sharedUnit(spots, boxOf);
      if (box === null) continue;
      const step = lockedStep(state, "claiming", digit, line, 18 + box, spots);
      if (step) return step;
    }
  }
  return null;
}

registerTechnique("pointing", findPointing);
registerTechnique("claiming", findClaiming);
