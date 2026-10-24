import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { UNITS, digitBit, emptyGrid, parseGrid, serializeGrid, type CellValue } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, type Step } from "../step";
import { nextStep, solveLogically } from "./driver";
import { defaultRegistry } from "./registry";
import { findHiddenSingle, findNakedSingle } from "./singles";
import "./techniques";

const solvedGrid = (seed: number): CellValue[] => solve(emptyGrid(), createRng(seed))!;

/** A solved grid with `holes` cells blanked, chosen by the seeded PRNG. Not necessarily unique. */
function blanked(seed: number, holes: number): { puzzle: CellValue[]; solution: CellValue[] } {
  const rng = createRng(`blank-${seed}`);
  const solution = solvedGrid(seed);
  const puzzle = [...solution];
  for (const cell of rng.shuffle([...puzzle.keys()]).slice(0, holes)) puzzle[cell] = 0;
  return { puzzle, solution };
}

function expectWellFormed(step: Step): void {
  expect(step.placements).toHaveLength(1);
  expect(step.eliminations).toEqual([]);
  expect(step.cells[0]).toBe(step.placements[0]!.cell);
  expect(new Set(step.cells).size).toBe(step.cells.length);
  expect(step.digits).toEqual([step.placements[0]!.digit]);
  expect(step.explanation).not.toMatch(/\n/);
  expect(step.explanation.length).toBeGreaterThan(0);
}

describe("findNakedSingle", () => {
  it("finds the only empty cell of an otherwise solved grid", () => {
    const solution = parseGrid(SAMPLE_EASY.solution);
    const grid = [...solution];
    grid[40] = 0; // r5c5
    const step = findNakedSingle(fromGrid(grid))!;
    expectWellFormed(step);
    expect(step.technique).toBe("naked-single");
    expect(step.placements).toEqual([{ cell: 40, digit: solution[40] }]);
    expect(step.explanation).toBe(`r5c5 can only hold ${solution[40]}`);
    // One placed peer per other digit, each holding a different digit.
    const blockerDigits = step.cells.slice(1).map((c) => grid[c]);
    expect(new Set(blockerDigits).size).toBe(8);
    expect(blockerDigits).not.toContain(solution[40]);
  });

  it("returns null when every empty cell has two or more candidates", () => {
    expect(findNakedSingle(fromGrid(emptyGrid()))).toBeNull();
  });

  it("does not mutate its input", () => {
    const state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
    const copy = structuredClone(state);
    findNakedSingle(state);
    expect(state).toEqual(copy);
  });
});

describe("findHiddenSingle", () => {
  it("finds a digit with one spot in a unit, even when that cell has other candidates", () => {
    // Empty grid, but 5 removed from every cell of box 1 except r2c2.
    let state: CandidateState = fromGrid(emptyGrid());
    for (const cell of UNITS[18]!) if (cell !== 10) state = eliminate(state, cell, 5);
    expect(findNakedSingle(state)).toBeNull();
    const step = findHiddenSingle(state)!;
    expectWellFormed(step);
    expect(step.technique).toBe("hidden-single");
    expect(step.placements).toEqual([{ cell: 10, digit: 5 }]);
    expect(step.units).toEqual([18]);
    expect(step.explanation).toBe("Only r2c2 in box 1 can hold 5");
  });

  it("names the placed digits that block the other cells of the unit", () => {
    const state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
    const step = findHiddenSingle(state)!;
    expectWellFormed(step);
    const digit = step.placements[0]!.digit;
    for (const c of step.cells.slice(1)) expect(state.values[c]).toBe(digit);
  });

  it("checks boxes before rows and columns", () => {
    const step = findHiddenSingle(fromGrid(parseGrid(SAMPLE_EASY.puzzle)))!;
    expect(step.units![0]).toBeGreaterThanOrEqual(18);
  });

  it("skips digits already placed in the unit and returns null on an empty grid", () => {
    expect(findHiddenSingle(fromGrid(emptyGrid()))).toBeNull();
    expect(findHiddenSingle(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
  });

  it("does not mutate its input", () => {
    const state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
    const copy = structuredClone(state);
    findHiddenSingle(state);
    expect(state).toEqual(copy);
  });
});

describe("registration", () => {
  it("registers both singles in the default registry at Easy", () => {
    expect(defaultRegistry.list("easy").map((t) => t.id)).toEqual(["naked-single", "hidden-single"]);
  });
});

describe("solveLogically at Easy", () => {
  it("fully solves the sample easy puzzle", () => {
    const result = solveLogically(fromGrid(parseGrid(SAMPLE_EASY.puzzle)), "easy");
    expect(result.solved).toBe(true);
    let state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
    for (const step of result.steps) state = applyStep(state, step);
    expect(serializeGrid(state.values)).toBe(SAMPLE_EASY.solution);
    expect(result.steps.every((s) => s.technique === "naked-single" || s.technique === "hidden-single")).toBe(true);
  });
});

describe("properties", () => {
  it("every Easy placement on a blanked solved grid equals the solution digit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 10, max: 64 }), (seed, holes) => {
        const { puzzle, solution } = blanked(seed, holes);
        let state = fromGrid(puzzle);
        for (let step = nextStep(state, "easy"); step; step = nextStep(state, "easy")) {
          for (const { cell, digit } of step.placements) expect(digit).toBe(solution[cell]);
          // The solution digit is never lost from an empty cell's candidates along the way.
          state = applyStep(state, step);
          state.values.forEach((v, c) => {
            if (v === 0) expect(state.candidates[c]! & digitBit(solution[c] as 1)).not.toBe(0);
          });
        }
      }),
      { numRuns: 60 },
    );
  });

  it("each finder's step is well formed and justified by its target cell", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 10, max: 64 }), (seed, holes) => {
        const state = fromGrid(blanked(seed, holes).puzzle);
        for (const find of [findNakedSingle, findHiddenSingle]) {
          const step = find(state);
          if (!step) continue;
          expectWellFormed(step);
          expect(state.values[step.placements[0]!.cell]).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
