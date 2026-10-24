import type { CandidateState } from "../candidates";
import { DIGITS, UNITS, digitBit, maskDigits, popcount, type Digit } from "../grid";
import { cellName, formatDigits, unitName, type Step, type TechniqueId } from "../step";
import { registerTechnique } from "./registry";

export type SubsetSize = 2 | 3 | 4;

const NAKED_IDS: Record<SubsetSize, TechniqueId> = { 2: "naked-pair", 3: "naked-triple", 4: "naked-quad" };
const HIDDEN_IDS: Record<SubsetSize, TechniqueId> = { 2: "hidden-pair", 3: "hidden-triple", 4: "hidden-quad" };

function checkSize(n: number): asserts n is SubsetSize {
  if (n !== 2 && n !== 3 && n !== 4) throw new RangeError(`Subset size must be 2, 3 or 4, got ${n}`);
}

/** Every n-element combination of `items`, in lexicographic order of positions. */
function* combinations<T>(items: readonly T[], n: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === n) {
    yield prefix;
    return;
  }
  for (let i = start; i <= items.length - (n - prefix.length); i++) {
    yield* combinations(items, n, i + 1, [...prefix, items[i]!]);
  }
}

/** "r1c1", "r1c1 and r1c5", "r1c1, r1c5 and r1c9"; keeps the given order. */
function formatCells(cells: readonly number[]): string {
  const names = cells.map(cellName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const emptyCells = (state: CandidateState, unit: number): number[] =>
  UNITS[unit]!.filter((c) => state.values[c] === 0);

/**
 * Naked subset of size n: the first unit (rows, then columns, then boxes) holding n empty
 * cells whose candidates together are exactly n digits, which then cannot go anywhere else in
 * that unit. Cells with a single candidate are skipped since that is a naked single, which the
 * driver tries first. units is [unit].
 */
export function findNakedSubset(state: CandidateState, n: number): Step | null {
  checkSize(n);
  for (let unit = 0; unit < UNITS.length; unit++) {
    const empty = emptyCells(state, unit);
    // n cells cannot form a subset unless at least one other cell could lose a candidate.
    if (empty.length <= n) continue;
    const pool = empty.filter((c) => {
      const size = popcount(state.candidates[c] ?? 0);
      return size >= 2 && size <= n;
    });
    for (const cells of combinations(pool, n)) {
      const mask = cells.reduce((m, c) => m | (state.candidates[c] ?? 0), 0);
      if (popcount(mask) !== n) continue;
      const inSubset = new Set(cells);
      const eliminations = empty
        .filter((c) => !inSubset.has(c))
        .flatMap((cell) => maskDigits((state.candidates[cell] ?? 0) & mask).map((digit) => ({ cell, digit })));
      if (eliminations.length === 0) continue;
      const digits = maskDigits(mask);
      const d = formatDigits(digits);
      const u = unitName(unit);
      return {
        technique: NAKED_IDS[n],
        placements: [],
        eliminations,
        cells,
        digits,
        units: [unit],
        explanation: `${formatCells(cells)} can only hold ${d}, so remove ${d} from the rest of ${u}`,
      };
    }
  }
  return null;
}

/**
 * Hidden subset of size n: the first unit (rows, then columns, then boxes) where n digits fit
 * only in the same n cells, so those cells can hold nothing else. Digits with a single spot
 * are skipped since that is a hidden single. units is [unit].
 */
export function findHiddenSubset(state: CandidateState, n: number): Step | null {
  checkSize(n);
  for (let unit = 0; unit < UNITS.length; unit++) {
    const empty = emptyCells(state, unit);
    if (empty.length <= n) continue;
    const spots = new Map<Digit, number[]>();
    for (const digit of DIGITS) {
      const bit = digitBit(digit);
      const where = empty.filter((c) => ((state.candidates[c] ?? 0) & bit) !== 0);
      if (where.length >= 2 && where.length <= n) spots.set(digit, where);
    }
    const combos: Generator<Digit[]> = combinations([...spots.keys()], n);
    for (const digits of combos) {
      const cellSet = new Set<number>(digits.flatMap((d: Digit) => spots.get(d) ?? []));
      if (cellSet.size !== n) continue;
      const cells = empty.filter((c) => cellSet.has(c));
      const mask = digits.reduce((m: number, d: Digit) => m | digitBit(d), 0);
      const eliminations = cells.flatMap((cell) =>
        maskDigits((state.candidates[cell] ?? 0) & ~mask).map((digit) => ({ cell, digit })),
      );
      if (eliminations.length === 0) continue;
      const d = formatDigits(digits);
      return {
        technique: HIDDEN_IDS[n],
        placements: [],
        eliminations,
        cells,
        digits,
        units: [unit],
        explanation: `In ${unitName(unit)}, ${d} fit only in ${formatCells(cells)}, so remove other candidates from those cells`,
      };
    }
  }
  return null;
}

export const findNakedPair = (state: CandidateState): Step | null => findNakedSubset(state, 2);
export const findHiddenPair = (state: CandidateState): Step | null => findHiddenSubset(state, 2);
export const findNakedTriple = (state: CandidateState): Step | null => findNakedSubset(state, 3);
export const findHiddenTriple = (state: CandidateState): Step | null => findHiddenSubset(state, 3);
export const findNakedQuad = (state: CandidateState): Step | null => findNakedSubset(state, 4);
export const findHiddenQuad = (state: CandidateState): Step | null => findHiddenSubset(state, 4);

// Level and weight come from TECHNIQUES in step.ts (Medium for pairs, Hard for triples and quads).
registerTechnique("naked-pair", findNakedPair);
registerTechnique("hidden-pair", findHiddenPair);
registerTechnique("naked-triple", findNakedTriple);
registerTechnique("hidden-triple", findHiddenTriple);
registerTechnique("naked-quad", findNakedQuad);
registerTechnique("hidden-quad", findHiddenQuad);
