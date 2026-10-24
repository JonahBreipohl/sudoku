import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, UNITS, digitBit, emptyGrid, parseGrid, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, type Step } from "../step";
import { nextStep } from "./driver";
import { findClaiming, findPointing } from "./locked";
import { defaultRegistry } from "./registry";
import { findHiddenSingle, findNakedSingle } from "./singles";
import { findHiddenPair, findHiddenSubset, findNakedPair, findNakedSubset } from "./subsets";
import "./techniques";

const ROW = (r: number) => r - 1;
const COL = (c: number) => 9 + c - 1;
const BOX = (b: number) => 18 + b - 1;

/** Empty-grid candidates, then each listed cell restricted to the listed digits. */
function restrict(entries: [number, Digit[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [cell, keep] of entries) {
    for (const d of DIGITS) if (!keep.includes(d)) state = eliminate(state, cell, d);
  }
  return state;
}

/** Empty-grid candidates with each digit removed from every listed cell. */
function remove(cells: number[], digits: Digit[]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const cell of cells) for (const d of digits) state = eliminate(state, cell, d);
  return state;
}

const has = (state: CandidateState, cell: number, digit: Digit) => ((state.candidates[cell] ?? 0) & digitBit(digit)) !== 0;

/** Every finder the default registry knows at Medium, keyed by technique id. */
const FINDERS = {
  "naked-single": findNakedSingle,
  "hidden-single": findHiddenSingle,
  pointing: findPointing,
  claiming: findClaiming,
  "naked-pair": findNakedPair,
  "hidden-pair": findHiddenPair,
};

const firing = (state: CandidateState) =>
  Object.entries(FINDERS)
    .filter(([, find]) => find(state) !== null)
    .map(([id]) => id);

function expectNakedWellFormed(state: CandidateState, step: Step, n: number): void {
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.cells).toHaveLength(n);
  expect(step.digits).toHaveLength(n);
  expect(step.units).toHaveLength(1);
  const unitCells = new Set(UNITS[step.units![0]!]!);
  const mask = step.digits.reduce((m, d) => m | digitBit(d), 0);
  for (const c of step.cells) {
    expect(unitCells.has(c)).toBe(true);
    expect(state.values[c]).toBe(0);
    expect((state.candidates[c] ?? 0) & ~mask).toBe(0);
  }
  for (const { cell, digit } of step.eliminations) {
    expect(unitCells.has(cell)).toBe(true);
    expect(step.cells).not.toContain(cell);
    expect(step.digits).toContain(digit);
    expect(has(state, cell, digit)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
}

function expectHiddenWellFormed(state: CandidateState, step: Step, n: number): void {
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.cells).toHaveLength(n);
  expect(step.digits).toHaveLength(n);
  expect(step.units).toHaveLength(1);
  const unit = UNITS[step.units![0]!]!;
  // Every spot of each subset digit in the unit is one of the subset cells.
  for (const d of step.digits) {
    for (const c of unit) if (state.values[c] === 0 && has(state, c, d)) expect(step.cells).toContain(c);
  }
  for (const { cell, digit } of step.eliminations) {
    expect(step.cells).toContain(cell);
    expect(step.digits).not.toContain(digit);
    expect(has(state, cell, digit)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
}

describe("findNakedSubset", () => {
  it("finds a naked pair and clears its digits from the rest of the row", () => {
    // r1c1 and r1c2 hold only 1 and 2.
    const state = restrict([
      [0, [1, 2]],
      [1, [1, 2]],
    ]);
    expect(firing(state)).toEqual(["naked-pair"]);
    const step = findNakedSubset(state, 2)!;
    expectNakedWellFormed(state, step, 2);
    expect(step).toEqual(findNakedPair(state));
    expect(step.technique).toBe("naked-pair");
    expect(step.cells).toEqual([0, 1]);
    expect(step.digits).toEqual([1, 2]);
    expect(step.units).toEqual([ROW(1)]);
    expect(step.eliminations).toEqual([2, 3, 4, 5, 6, 7, 8].flatMap((cell) => [1, 2].map((digit) => ({ cell, digit }))));
    expect(step.explanation).toBe("r1c1 and r1c2 can only hold 1 and 2, so remove 1 and 2 from the rest of row 1");
  });

  it("moves on to a box when the row has nothing left to clear", () => {
    // r1c1 and r2c2 share box 1 but no row or column, so rows and columns find nothing first.
    const state = restrict([
      [0, [4, 9]],
      [10, [4, 9]],
    ]);
    const step = findNakedSubset(state, 2)!;
    expectNakedWellFormed(state, step, 2);
    expect(step.units).toEqual([BOX(1)]);
    expect(step.cells).toEqual([0, 10]);
    expect(step.eliminations.map((e) => e.cell)).toEqual([1, 1, 2, 2, 9, 9, 11, 11, 18, 18, 19, 19, 20, 20]);
  });

  it("finds a naked triple whose cells hold only two of its digits each", () => {
    // Column 5: {3,5}, {5,8}, {3,8} in r2, r4 and r9.
    const state = restrict([
      [13, [3, 5]],
      [31, [5, 8]],
      [76, [3, 8]],
    ]);
    expect(findNakedSubset(state, 2)).toBeNull();
    const step = findNakedSubset(state, 3)!;
    expectNakedWellFormed(state, step, 3);
    expect(step.technique).toBe("naked-triple");
    expect(step.units).toEqual([COL(5)]);
    expect(step.cells).toEqual([13, 31, 76]);
    expect(step.explanation).toBe("r2c5, r4c5 and r9c5 can only hold 3, 5 and 8, so remove 3, 5 and 8 from the rest of column 5");
  });

  it("skips a subset that eliminates nothing", () => {
    let state = restrict([
      [0, [1, 2]],
      [1, [1, 2]],
    ]);
    for (const cell of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20]) {
      state = eliminate(eliminate(state, cell, 1), cell, 2);
    }
    expect(findNakedSubset(state, 2)).toBeNull();
  });

  it("rejects sizes outside 2-4", () => {
    const state = fromGrid(emptyGrid());
    expect(() => findNakedSubset(state, 1)).toThrow(RangeError);
    expect(() => findNakedSubset(state, 5)).toThrow(RangeError);
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findNakedSubset(fromGrid(emptyGrid()), 2)).toBeNull();
    expect(findNakedSubset(fromGrid(parseGrid(SAMPLE_EASY.solution)), 2)).toBeNull();
    const state = restrict([
      [0, [1, 2]],
      [1, [1, 2]],
    ]);
    const copy = structuredClone(state);
    findNakedSubset(state, 2);
    expect(state).toEqual(copy);
  });
});

describe("findHiddenSubset", () => {
  it("finds a hidden pair and clears the other candidates from its cells", () => {
    // In row 1, 1 and 2 fit only r1c1 and r1c9 (different boxes, so claiming cannot fire).
    const state = remove([1, 2, 3, 4, 5, 6, 7], [1, 2]);
    expect(firing(state)).toEqual(["hidden-pair"]);
    const step = findHiddenSubset(state, 2)!;
    expectHiddenWellFormed(state, step, 2);
    expect(step).toEqual(findHiddenPair(state));
    expect(step.technique).toBe("hidden-pair");
    expect(step.cells).toEqual([0, 8]);
    expect(step.digits).toEqual([1, 2]);
    expect(step.units).toEqual([ROW(1)]);
    expect(step.eliminations).toEqual([0, 8].flatMap((cell) => [3, 4, 5, 6, 7, 8, 9].map((digit) => ({ cell, digit }))));
    expect(step.explanation).toBe("In row 1, 1 and 2 fit only in r1c1 and r1c9, so remove other candidates from those cells");
  });

  it("finds a hidden triple in a box", () => {
    // In box 5, 4, 6 and 7 fit only r4c4, r5c5 and r6c6.
    const others = UNITS[BOX(5)]!.filter((c) => ![30, 40, 50].includes(c));
    const state = remove(others, [4, 6, 7]);
    const step = findHiddenSubset(state, 3)!;
    expectHiddenWellFormed(state, step, 3);
    expect(step.technique).toBe("hidden-triple");
    expect(step.units).toEqual([BOX(5)]);
    expect(step.cells).toEqual([30, 40, 50]);
    expect(step.digits).toEqual([4, 6, 7]);
    expect(step.eliminations).toHaveLength(18);
  });

  it("skips a hidden subset whose cells hold nothing else", () => {
    let state = remove([1, 2, 3, 4, 5, 6, 7], [1, 2]);
    for (const cell of [0, 8]) for (const d of [3, 4, 5, 6, 7, 8, 9] as Digit[]) state = eliminate(state, cell, d);
    expect(findHiddenSubset(state, 2)).toBeNull();
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findHiddenSubset(fromGrid(emptyGrid()), 2)).toBeNull();
    expect(findHiddenSubset(fromGrid(parseGrid(SAMPLE_EASY.solution)), 4)).toBeNull();
    const state = remove([1, 2, 3, 4, 5, 6, 7], [1, 2]);
    const copy = structuredClone(state);
    findHiddenSubset(state, 2);
    expect(state).toEqual(copy);
  });
});

describe("registration", () => {
  it("registers naked and hidden pairs at Medium after locked candidates", () => {
    expect(defaultRegistry.list("medium").map((t) => t.id)).toEqual([
      "naked-single",
      "hidden-single",
      "pointing",
      "claiming",
      "naked-pair",
      "hidden-pair",
    ]);
  });

  it("the driver picks them when nothing cheaper applies", () => {
    const naked = restrict([
      [0, [1, 2]],
      [1, [1, 2]],
    ]);
    const hidden = remove([1, 2, 3, 4, 5, 6, 7], [1, 2]);
    expect(nextStep(naked, "medium")?.technique).toBe("naked-pair");
    expect(nextStep(hidden, "medium")?.technique).toBe("hidden-pair");
    expect(nextStep(hidden, "easy")).toBeNull();
  });
});

/** A solved grid with `holes` cells blanked by the seeded PRNG. Not necessarily unique, which is fine: sound eliminations keep every solution. */
function blanked(seed: number, holes: number): { puzzle: CellValue[]; solution: CellValue[] } {
  const rng = createRng(`subsets-${seed}`);
  const solution = solve(emptyGrid(), rng)!;
  const puzzle = [...solution];
  for (const cell of rng.shuffle([...puzzle.keys()]).slice(0, holes)) puzzle[cell] = 0;
  return { puzzle, solution };
}

describe("properties", () => {
  it("never eliminates a solution digit, at any state along a Medium solve", () => {
    const fired = { naked: 0, hidden: 0 };
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 40, max: 64 }), (seed, holes) => {
        const { puzzle, solution } = blanked(seed, holes);
        let state = fromGrid(puzzle);
        for (;;) {
          // Call the finders directly at every state and size, since cheaper steps usually win in the driver.
          for (const n of [2, 3, 4]) {
            const naked = findNakedSubset(state, n);
            if (naked) {
              fired.naked++;
              expectNakedWellFormed(state, naked, n);
              for (const { cell, digit } of naked.eliminations) expect(digit).not.toBe(solution[cell]);
            }
            const hidden = findHiddenSubset(state, n);
            if (hidden) {
              fired.hidden++;
              expectHiddenWellFormed(state, hidden, n);
              for (const { cell, digit } of hidden.eliminations) expect(digit).not.toBe(solution[cell]);
            }
          }
          const step = nextStep(state, "medium");
          if (!step) break;
          state = applyStep(state, step);
        }
      }),
      { numRuns: 40 },
    );
    // Guards against a vacuous pass if the generator stopped producing subsets.
    expect(fired.naked).toBeGreaterThan(0);
    expect(fired.hidden).toBeGreaterThan(0);
  });
});
