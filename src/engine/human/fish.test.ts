import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, UNITS, cellIndex, digitBit, emptyGrid, parseGrid, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, type Step } from "../step";
import { nextStep } from "./driver";
import { findFish, findSwordfish, findXWing, type FishOrientation } from "./fish";
import { defaultRegistry } from "./registry";
import "./techniques";

const ROW = (r: number) => r - 1;
const COL = (c: number) => 9 + c - 1;
const cell = (r: number, c: number) => cellIndex(r - 1, c - 1);

const has = (state: CandidateState, c: number, digit: Digit) =>
  state.values[c] === 0 && ((state.candidates[c] ?? 0) & digitBit(digit)) !== 0;

/** Empty-grid candidates where `digit` stays only at the given spots within each listed line. */
function confine(orientation: FishOrientation, digit: Digit, lines: [number, number[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [line, keep] of lines) {
    for (let pos = 1; pos <= 9; pos++) {
      if (keep.includes(pos)) continue;
      state = eliminate(state, orientation === "row" ? cell(line, pos) : cell(pos, line), digit);
    }
  }
  return state;
}

/** Checks the fish invariant directly against the state, independent of how the finder searched. */
function expectFishWellFormed(state: CandidateState, step: Step, n: number): void {
  expect(step.technique).toBe(n === 2 ? "x-wing" : "swordfish");
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.digits).toHaveLength(1);
  const digit = step.digits[0]!;
  expect(step.units).toHaveLength(2 * n);
  const base = step.units!.slice(0, n);
  const cover = step.units!.slice(n);
  // Base lines are all rows or all columns, and cover lines are the other kind.
  const rowBased = base[0]! < 9;
  for (const u of base) expect(u < 9).toBe(rowBased);
  for (const u of cover) expect(u < 9).toBe(!rowBased);
  const coverCells = new Set(cover.flatMap((u) => UNITS[u]!));
  const baseCells = new Set(base.flatMap((u) => UNITS[u]!));
  const spots = [...baseCells].filter((c) => has(state, c, digit)).sort((a, b) => a - b);
  expect(step.cells).toEqual(spots);
  for (const c of spots) expect(coverCells.has(c)).toBe(true);
  for (const u of base) expect(UNITS[u]!.filter((c) => has(state, c, digit)).length).toBeGreaterThanOrEqual(2);
  for (const { cell: c, digit: d } of step.eliminations) {
    expect(d).toBe(digit);
    expect(coverCells.has(c)).toBe(true);
    expect(baseCells.has(c)).toBe(false);
    expect(has(state, c, d)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
}

// Digit 1 in rows 1 and 5 only at columns 2 and 8 (different boxes, so no locked candidates).
const ROW_XWING = () =>
  confine("row", 1, [
    [1, [2, 8]],
    [5, [2, 8]],
  ]);
// Digit 1 in columns 1 and 5 only at rows 2 and 8.
const COL_XWING = () =>
  confine("column", 1, [
    [1, [2, 8]],
    [5, [2, 8]],
  ]);
// Digit 5 in rows 1, 4 and 7 at columns {1,4}, {4,7}, {1,7}: no two rows form an X-Wing.
const ROW_SWORDFISH = () =>
  confine("row", 5, [
    [1, [1, 4]],
    [4, [4, 7]],
    [7, [1, 7]],
  ]);
// The transpose: digit 5 in columns 2, 5 and 8 at rows {2,5}, {5,8}, {2,8}.
const COL_SWORDFISH = () =>
  confine("column", 5, [
    [2, [2, 5]],
    [5, [5, 8]],
    [8, [2, 8]],
  ]);

describe("X-Wing", () => {
  it("finds a row-based X-Wing and clears the digit from its columns", () => {
    const state = ROW_XWING();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findXWing(state));
    expectFishWellFormed(state, step, 2);
    expect(step.cells).toEqual([cell(1, 2), cell(1, 8), cell(5, 2), cell(5, 8)]);
    expect(step.digits).toEqual([1]);
    expect(step.units).toEqual([ROW(1), ROW(5), COL(2), COL(8)]);
    const elimRows = [2, 3, 4, 6, 7, 8, 9];
    expect(step.eliminations).toEqual(elimRows.flatMap((r) => [2, 8].map((c) => ({ cell: cell(r, c), digit: 1 }))));
    expect(step.explanation).toBe(
      "In rows 1 and 5, 1 fits only in columns 2 and 8, so remove 1 from columns 2 and 8 outside those rows",
    );
  });

  it("finds a column-based X-Wing and clears the digit from its rows", () => {
    const state = COL_XWING();
    expect(findFish(state, 2, ["row"])).toBeNull();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findXWing(state));
    expectFishWellFormed(state, step, 2);
    expect(step.cells).toEqual([cell(2, 1), cell(2, 5), cell(8, 1), cell(8, 5)]);
    expect(step.units).toEqual([COL(1), COL(5), ROW(2), ROW(8)]);
    const elimCols = [2, 3, 4, 6, 7, 8, 9];
    expect(step.eliminations).toEqual(
      [2, 8].flatMap((r) => elimCols.map((c) => ({ cell: cell(r, c), digit: 1 }))),
    );
    expect(step.explanation).toBe(
      "In columns 1 and 5, 1 fits only in rows 2 and 8, so remove 1 from rows 2 and 8 outside those columns",
    );
  });

  it("skips an X-Wing that eliminates nothing", () => {
    let state = ROW_XWING();
    for (const r of [2, 3, 4, 6, 7, 8, 9]) for (const c of [2, 8]) state = eliminate(state, cell(r, c), 1);
    // Columns 2 and 8 are now themselves an X-Wing on rows 1 and 5 with nothing left to clear.
    expect(findXWing(state)).toBeNull();
  });
});

describe("Swordfish", () => {
  it("finds a row-based Swordfish with two spots per row", () => {
    const state = ROW_SWORDFISH();
    expect(findXWing(state)).toBeNull();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findSwordfish(state));
    expectFishWellFormed(state, step, 3);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 4), cell(4, 4), cell(4, 7), cell(7, 1), cell(7, 7)]);
    expect(step.digits).toEqual([5]);
    expect(step.units).toEqual([ROW(1), ROW(4), ROW(7), COL(1), COL(4), COL(7)]);
    expect(step.eliminations).toHaveLength(18);
    expect(step.explanation).toBe(
      "In rows 1, 4 and 7, 5 fits only in columns 1, 4 and 7, so remove 5 from columns 1, 4 and 7 outside those rows",
    );
  });

  it("finds a column-based Swordfish", () => {
    const state = COL_SWORDFISH();
    expect(findXWing(state)).toBeNull();
    expect(findFish(state, 3, ["row"])).toBeNull();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findSwordfish(state));
    expectFishWellFormed(state, step, 3);
    expect(step.units).toEqual([COL(2), COL(5), COL(8), ROW(2), ROW(5), ROW(8)]);
    expect(step.eliminations).toEqual(
      [2, 5, 8].flatMap((r) => [1, 3, 4, 6, 7, 9].map((c) => ({ cell: cell(r, c), digit: 5 }))),
    );
  });

  it("finds a Swordfish with three spots in one line", () => {
    const state = confine("row", 7, [
      [2, [3, 5, 9]],
      [6, [3, 5]],
      [9, [5, 9]],
    ]);
    expect(findXWing(state)).toBeNull();
    const step = findSwordfish(state)!;
    expectFishWellFormed(state, step, 3);
    expect(step.units).toEqual([ROW(2), ROW(6), ROW(9), COL(3), COL(5), COL(9)]);
  });
});

describe("findFish", () => {
  it("rejects sizes outside 2-3", () => {
    const state = fromGrid(emptyGrid());
    expect(() => findFish(state, 1)).toThrow(RangeError);
    expect(() => findFish(state, 4)).toThrow(RangeError);
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    for (const n of [2, 3]) {
      expect(findFish(fromGrid(emptyGrid()), n)).toBeNull();
      expect(findFish(fromGrid(parseGrid(SAMPLE_EASY.solution)), n)).toBeNull();
    }
    const state = ROW_SWORDFISH();
    const copy = structuredClone(state);
    findSwordfish(state);
    findXWing(state);
    expect(state).toEqual(copy);
  });
});

describe("registration", () => {
  it("registers X-Wing and Swordfish at Expert with their weights", () => {
    const expert = defaultRegistry.list("expert").filter((t) => t.level === "expert");
    expect(expert.map((t) => [t.id, t.weight])).toEqual([
      ["x-wing", 30],
      ["swordfish", 45],
    ]);
    expect(defaultRegistry.list("hard").some((t) => t.level === "expert")).toBe(false);
  });
});

/**
 * A blanked solved grid with extra candidates removed at random, never the solution digit.
 * Sound eliminations keep the solution valid, and thinning candidates makes fish far more
 * common than in pencil-mark states reached by solving alone.
 */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`fish-${seed}`);
  const solution = solve(emptyGrid(), rng)!;
  const puzzle = [...solution];
  for (const c of rng.shuffle([...puzzle.keys()]).slice(0, holes)) puzzle[c] = 0;
  let state = fromGrid(puzzle);
  for (let i = 0; i < removals; i++) {
    const c = rng.int(81);
    const d = DIGITS[rng.int(9)]!;
    if (d !== solution[c] && has(state, c, d)) state = eliminate(state, c, d);
  }
  return { state, solution };
}

describe("properties", () => {
  it("never eliminates a solution digit, at any state along an Expert solve", () => {
    const fired = { 2: { row: 0, column: 0 }, 3: { row: 0, column: 0 } };
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 40, max: 64 }),
        fc.integer({ min: 0, max: 200 }),
        (seed, holes, removals) => {
          const { state: start, solution } = thinned(seed, holes, removals);
          let state = start;
          for (;;) {
            // Call the finders directly at every state, since cheaper steps usually win in the driver.
            for (const n of [2, 3] as const) {
              for (const orientation of ["row", "column"] as const) {
                const step = findFish(state, n, [orientation]);
                if (!step) continue;
                fired[n][orientation]++;
                expectFishWellFormed(state, step, n);
                expect(step.units![0]! < 9).toBe(orientation === "row");
                for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
              }
            }
            const step = nextStep(state, "expert");
            if (!step) break;
            for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
            state = applyStep(state, step);
          }
        },
      ),
      { numRuns: 40 },
    );
    // Guards against a vacuous pass: each size fires in each orientation at least once.
    for (const n of [2, 3] as const) {
      expect(fired[n].row).toBeGreaterThan(0);
      expect(fired[n].column).toBeGreaterThan(0);
    }
  });
});
