import type { CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, digitBit, maskDigits, popcount, type Digit } from "../grid";
import { cellName, unitName, type Step } from "../step";
import { registerTechnique } from "./registry";

/**
 * Boxes first, then rows, then columns: the order most people scan for hidden singles, so the
 * hint a player sees is the one they are most likely to spot themselves.
 */
const HIDDEN_SINGLE_UNIT_ORDER: readonly number[] = [
  ...Array.from({ length: 9 }, (_, i) => 18 + i),
  ...Array.from({ length: 9 }, (_, i) => i),
  ...Array.from({ length: 9 }, (_, i) => 9 + i),
];

/** The first placed peer of `cell` holding `digit`, or -1 when the digit was ruled out by notes. */
function blockerOf(state: CandidateState, cell: number, digit: Digit): number {
  return PEERS[cell]!.find((peer) => state.values[peer] === digit) ?? -1;
}

/** Target first, then the blockers, deduplicated and without the -1 "no blocker" marker. */
function justifying(target: number, blockers: readonly number[]): number[] {
  return [target, ...new Set(blockers.filter((c) => c >= 0 && c !== target))];
}

/**
 * The first empty cell, in reading order, with exactly one candidate. Its justifying cells are
 * the cell itself followed by one placed peer for each other digit it rules out.
 */
export function findNakedSingle(state: CandidateState): Step | null {
  for (let cell = 0; cell < 81; cell++) {
    if (state.values[cell] !== 0) continue;
    const mask = state.candidates[cell] ?? 0;
    if (popcount(mask) !== 1) continue;
    const digit = maskDigits(mask)[0]!;
    const blockers = DIGITS.filter((d) => d !== digit).map((d) => blockerOf(state, cell, d));
    return {
      technique: "naked-single",
      placements: [{ cell, digit }],
      eliminations: [],
      cells: justifying(cell, blockers),
      digits: [digit],
      explanation: `${cellName(cell)} can only hold ${digit}`,
    };
  }
  return null;
}

/**
 * The first unit (boxes, rows, then columns) where a digit not yet placed fits in exactly one
 * cell. Its justifying cells are that cell followed by the placed peers that block the digit
 * from the unit's other empty cells.
 */
export function findHiddenSingle(state: CandidateState): Step | null {
  for (const unit of HIDDEN_SINGLE_UNIT_ORDER) {
    const cells = UNITS[unit]!;
    for (const digit of DIGITS) {
      if (cells.some((c) => state.values[c] === digit)) continue;
      const bit = digitBit(digit);
      const spots = cells.filter((c) => state.values[c] === 0 && ((state.candidates[c] ?? 0) & bit) !== 0);
      if (spots.length !== 1) continue;
      const cell = spots[0]!;
      const blockers = cells
        .filter((c) => c !== cell && state.values[c] === 0)
        .map((c) => blockerOf(state, c, digit));
      return {
        technique: "hidden-single",
        placements: [{ cell, digit }],
        eliminations: [],
        cells: justifying(cell, blockers),
        digits: [digit],
        units: [unit],
        explanation: `Only ${cellName(cell)} in ${unitName(unit)} can hold ${digit}`,
      };
    }
  }
  return null;
}

registerTechnique("naked-single", findNakedSingle);
registerTechnique("hidden-single", findHiddenSingle);
