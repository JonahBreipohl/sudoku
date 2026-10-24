import type { CandidateState } from "../candidates";
import { DIGITS, cellIndex, digitBit, type Digit } from "../grid";
import { formatDigits, type Step, type TechniqueId } from "../step";
import { registerTechnique } from "./registry";

export type FishSize = 2 | 3;
/** Which lines are the base: "row" fish find a digit confined to n columns across n rows. */
export type FishOrientation = "row" | "column";

const FISH_IDS: Record<FishSize, TechniqueId> = { 2: "x-wing", 3: "swordfish" };

function checkSize(n: number): asserts n is FishSize {
  if (n !== 2 && n !== 3) throw new RangeError(`Fish size must be 2 or 3, got ${n}`);
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

/** Cell at position `pos` of line `line` (0-8) for the given base orientation. */
const cellAt = (orientation: FishOrientation, line: number, pos: number): number =>
  orientation === "row" ? cellIndex(line, pos) : cellIndex(pos, line);

/** Unit index of a base line or a cover line. */
const baseUnit = (orientation: FishOrientation, line: number): number => (orientation === "row" ? line : 9 + line);
const coverUnit = (orientation: FishOrientation, line: number): number => (orientation === "row" ? 9 + line : line);

/** "rows 1 and 5", "columns 2, 4 and 8" for 0-based line indices. */
const formatLines = (kind: "row" | "column", lines: readonly number[]): string =>
  `${kind}s ${formatDigits(lines.map((l) => l + 1))}`;

/**
 * Basic fish of size n for one orientation: the first digit with n base lines (rows for "row")
 * whose candidates for it all fall in the same n cover lines (columns for "row"). The digit
 * must take one spot per base line inside those cover lines, so it fills each cover line from
 * the base and can be cleared from the cover lines elsewhere. Base lines with one spot are
 * skipped (hidden single), and so are combinations covering fewer than n lines, which would
 * mean a contradiction or a smaller fish that the cheaper finder reports.
 * cells is every base candidate, sorted; units is base lines then cover lines.
 */
function findFishIn(state: CandidateState, n: FishSize, orientation: FishOrientation): Step | null {
  for (const digit of DIGITS) {
    const bit = digitBit(digit);
    const has = (cell: number) => state.values[cell] === 0 && ((state.candidates[cell] ?? 0) & bit) !== 0;
    // Base line -> positions (cover line indices) that still hold the digit.
    const lines: { line: number; positions: number[] }[] = [];
    for (let line = 0; line < 9; line++) {
      const positions: number[] = [];
      for (let pos = 0; pos < 9; pos++) if (has(cellAt(orientation, line, pos))) positions.push(pos);
      if (positions.length >= 2 && positions.length <= n) lines.push({ line, positions });
    }
    for (const base of combinations(lines, n)) {
      const covers = [...new Set(base.flatMap((b) => b.positions))].sort((a, b) => a - b);
      if (covers.length !== n) continue;
      const baseLines = base.map((b) => b.line);
      const inBase = new Set(baseLines);
      const eliminations: { cell: number; digit: Digit }[] = [];
      for (const cover of covers) {
        for (let line = 0; line < 9; line++) {
          const cell = cellAt(orientation, line, cover);
          if (!inBase.has(line) && has(cell)) eliminations.push({ cell, digit });
        }
      }
      if (eliminations.length === 0) continue;
      eliminations.sort((a, b) => a.cell - b.cell);
      const cells = base.flatMap((b) => b.positions.map((p) => cellAt(orientation, b.line, p))).sort((a, b) => a - b);
      const coverKind = orientation === "row" ? "column" : "row";
      const bases = formatLines(orientation, baseLines);
      const coverText = formatLines(coverKind, covers);
      return {
        technique: FISH_IDS[n],
        placements: [],
        eliminations,
        cells,
        digits: [digit],
        units: [...baseLines.map((l) => baseUnit(orientation, l)), ...covers.map((c) => coverUnit(orientation, c))],
        explanation: `In ${bases}, ${digit} fits only in ${coverText}, so remove ${digit} from ${coverText} outside those ${orientation}s`,
      };
    }
  }
  return null;
}

/** Fish of size n: row-based first, then column-based. */
export function findFish(state: CandidateState, n: number, orientations: readonly FishOrientation[] = ["row", "column"]): Step | null {
  checkSize(n);
  for (const orientation of orientations) {
    const step = findFishIn(state, n, orientation);
    if (step) return step;
  }
  return null;
}

export const findXWing = (state: CandidateState): Step | null => findFish(state, 2);
export const findSwordfish = (state: CandidateState): Step | null => findFish(state, 3);

// Level and weight come from TECHNIQUES in step.ts (Expert: X-Wing 30, Swordfish 45).
registerTechnique("x-wing", findXWing);
registerTechnique("swordfish", findSwordfish);
