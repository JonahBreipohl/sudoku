import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { UNITS, digitBit, emptyGrid, parseGrid, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, type Step } from "../step";
import { nextStep } from "./driver";
import { findClaiming, findPointing } from "./locked";
import { defaultRegistry } from "./registry";
import { findHiddenSingle, findNakedSingle } from "./singles";
import "./techniques";

const ROW = (r: number) => r - 1;
const COL = (c: number) => 9 + c - 1;
const BOX = (b: number) => 18 + b - 1;

/** Empty-grid candidates with `digit` removed from every cell of `unit` that `keep` rejects. */
function withRemoved(unit: number, digit: Digit, keep: (cell: number) => boolean): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const cell of UNITS[unit]!) if (!keep(cell)) state = eliminate(state, cell, digit);
  return state;
}

const inUnit = (unit: number) => {
  const set = new Set(UNITS[unit]!);
  return (cell: number) => set.has(cell);
};

const has = (state: CandidateState, cell: number, digit: Digit) => ((state.candidates[cell] ?? 0) & digitBit(digit)) !== 0;

/** Every finder the default registry knows at Medium so far, keyed by technique id. */
const FINDERS = {
  "naked-single": findNakedSingle,
  "hidden-single": findHiddenSingle,
  pointing: findPointing,
  claiming: findClaiming,
};

const firing = (state: CandidateState) =>
  Object.entries(FINDERS)
    .filter(([, find]) => find(state) !== null)
    .map(([id]) => id);

/** Structural checks shared by both techniques; units is [source, target]. */
function expectWellFormed(state: CandidateState, step: Step): void {
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.digits).toHaveLength(1);
  expect(step.units).toHaveLength(2);
  const digit = step.digits[0]!;
  const [source, target] = step.units! as [number, number];
  const sourceCells = new Set(UNITS[source]!);
  const targetCells = new Set(UNITS[target]!);
  // The highlighted cells are every spot of the digit in the source, all inside the target.
  const spots = UNITS[source]!.filter((c) => state.values[c] === 0 && has(state, c, digit));
  expect(step.cells).toEqual(spots);
  expect(step.cells.length).toBeGreaterThanOrEqual(2);
  for (const c of step.cells) expect(targetCells.has(c)).toBe(true);
  for (const { cell, digit: d } of step.eliminations) {
    expect(d).toBe(digit);
    expect(targetCells.has(cell)).toBe(true);
    expect(sourceCells.has(cell)).toBe(false);
    expect(has(state, cell, d)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
}

describe("findPointing", () => {
  it("removes a digit confined to one row of a box from the rest of that row", () => {
    // Box 4 keeps 7 only in row 5 (r5c1..r5c3).
    const state = withRemoved(BOX(4), 7, inUnit(ROW(5)));
    expect(firing(state)).toEqual(["pointing"]);
    const step = findPointing(state)!;
    expectWellFormed(state, step);
    expect(step.technique).toBe("pointing");
    expect(step.cells).toEqual([36, 37, 38]);
    expect(step.units).toEqual([BOX(4), ROW(5)]);
    expect(step.eliminations).toEqual([39, 40, 41, 42, 43, 44].map((cell) => ({ cell, digit: 7 })));
    expect(step.explanation).toBe("In box 4, 7 is only in row 5, so remove 7 from row 5 outside box 4");
  });

  it("works along a column with only two spots", () => {
    // Box 9 keeps 3 only in r7c8 and r9c8.
    const state = withRemoved(BOX(9), 3, (c) => c === 61 || c === 79);
    expect(firing(state)).toEqual(["pointing"]);
    const step = findPointing(state)!;
    expectWellFormed(state, step);
    expect(step.cells).toEqual([61, 79]);
    expect(step.units).toEqual([BOX(9), COL(8)]);
    expect(step.eliminations.map((e) => e.cell)).toEqual([7, 16, 25, 34, 43, 52]);
    expect(step.explanation).toBe("In box 9, 3 is only in column 8, so remove 3 from column 8 outside box 9");
  });

  it("skips a confinement that eliminates nothing", () => {
    let state = withRemoved(BOX(4), 7, inUnit(ROW(5)));
    for (const cell of UNITS[ROW(5)]!.slice(3)) state = eliminate(state, cell, 7);
    expect(findPointing(state)).toBeNull();
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findPointing(fromGrid(emptyGrid()))).toBeNull();
    expect(findPointing(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = withRemoved(BOX(4), 7, inUnit(ROW(5)));
    const copy = structuredClone(state);
    findPointing(state);
    expect(state).toEqual(copy);
  });
});

describe("findClaiming", () => {
  it("removes a digit confined to one box of a row from the rest of that box", () => {
    // Row 5 keeps 7 only in box 4 (r5c1..r5c3).
    const state = withRemoved(ROW(5), 7, inUnit(BOX(4)));
    expect(firing(state)).toEqual(["claiming"]);
    const step = findClaiming(state)!;
    expectWellFormed(state, step);
    expect(step.technique).toBe("claiming");
    expect(step.cells).toEqual([36, 37, 38]);
    expect(step.units).toEqual([ROW(5), BOX(4)]);
    expect(step.eliminations).toEqual([27, 28, 29, 45, 46, 47].map((cell) => ({ cell, digit: 7 })));
    expect(step.explanation).toBe("In row 5, 7 is only in box 4, so remove 7 from box 4 outside row 5");
  });

  it("works along a column with only two spots", () => {
    // Column 2 keeps 9 only in r1c2 and r3c2.
    const state = withRemoved(COL(2), 9, (c) => c === 1 || c === 19);
    expect(firing(state)).toEqual(["claiming"]);
    const step = findClaiming(state)!;
    expectWellFormed(state, step);
    expect(step.units).toEqual([COL(2), BOX(1)]);
    expect(step.eliminations.map((e) => e.cell)).toEqual([0, 2, 9, 11, 18, 20]);
    expect(step.explanation).toBe("In column 2, 9 is only in box 1, so remove 9 from box 1 outside column 2");
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findClaiming(fromGrid(emptyGrid()))).toBeNull();
    expect(findClaiming(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = withRemoved(ROW(5), 7, inUnit(BOX(4)));
    const copy = structuredClone(state);
    findClaiming(state);
    expect(state).toEqual(copy);
  });
});

describe("registration", () => {
  it("registers pointing and claiming at Medium after the singles", () => {
    expect(defaultRegistry.list("medium").map((t) => t.id).slice(0, 4)).toEqual([
      "naked-single",
      "hidden-single",
      "pointing",
      "claiming",
    ]);
    expect(defaultRegistry.list("easy").map((t) => t.id)).not.toContain("pointing");
  });

  it("the driver picks them when nothing cheaper applies", () => {
    expect(nextStep(withRemoved(BOX(4), 7, inUnit(ROW(5))), "medium")?.technique).toBe("pointing");
    expect(nextStep(withRemoved(ROW(5), 7, inUnit(BOX(4))), "medium")?.technique).toBe("claiming");
    expect(nextStep(withRemoved(ROW(5), 7, inUnit(BOX(4))), "easy")).toBeNull();
  });
});

/** A solved grid with `holes` cells blanked by the seeded PRNG. Not necessarily unique, which is fine: sound eliminations keep every solution. */
function blanked(seed: number, holes: number): { puzzle: CellValue[]; solution: CellValue[] } {
  const rng = createRng(`locked-${seed}`);
  const solution = solve(emptyGrid(), rng)!;
  const puzzle = [...solution];
  for (const cell of rng.shuffle([...puzzle.keys()]).slice(0, holes)) puzzle[cell] = 0;
  return { puzzle, solution };
}

describe("properties", () => {
  it("never eliminates a solution digit, at any state along a Medium solve", () => {
    let fired = 0;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 30, max: 64 }), (seed, holes) => {
        const { puzzle, solution } = blanked(seed, holes);
        let state = fromGrid(puzzle);
        for (;;) {
          // Call both finders directly at every state, since singles usually win in the driver.
          for (const find of [findPointing, findClaiming]) {
            const step = find(state);
            if (!step) continue;
            fired++;
            expectWellFormed(state, step);
            for (const { cell, digit } of step.eliminations) expect(digit).not.toBe(solution[cell]);
          }
          const step = nextStep(state, "medium");
          if (!step) break;
          state = applyStep(state, step);
        }
      }),
      { numRuns: 60 },
    );
    // Guards against a vacuous pass if the generator stopped producing locked candidates.
    expect(fired).toBeGreaterThan(0);
  });
});
