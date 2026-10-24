import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, PEERS, cellIndex, digitBit, emptyGrid, maskDigits, parseGrid, popcount, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, cellName, type Step } from "../step";
import { nextStep, solveLogically } from "./driver";
import { findSwordfish, findXWing } from "./fish";
import { createRegistry, defaultRegistry } from "./registry";
import { findXYWing, findXYZWing } from "./wings";
import "./techniques";

const cell = (r: number, c: number) => cellIndex(r - 1, c - 1);
const sees = (a: number, b: number) => PEERS[a]!.includes(b);
const maskAt = (state: CandidateState, c: number) => (state.values[c] === 0 ? (state.candidates[c] ?? 0) : 0);
const has = (state: CandidateState, c: number, digit: Digit) => (maskAt(state, c) & digitBit(digit)) !== 0;

/** Empty-grid candidates with the listed cells cut down to exactly the given digits. */
function withMarks(marks: [number, Digit[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [c, keep] of marks) for (const d of DIGITS) if (!keep.includes(d)) state = eliminate(state, c, d);
  return state;
}

/** A registry with every default technique except the listed ones. */
function registryWithout(...ids: string[]) {
  const registry = createRegistry();
  for (const t of defaultRegistry.list()) if (!ids.includes(t.id)) registry.register(t.id, t.find);
  return registry;
}

/** Checks the wing invariant directly against the state, independent of how the finder searched. */
function expectWingWellFormed(state: CandidateState, step: Step, kind: "xy-wing" | "xyz-wing"): void {
  expect(step.technique).toBe(kind);
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.cells).toHaveLength(3);
  const [pivot, a, b] = step.cells as [number, number, number];
  const pm = maskAt(state, pivot);
  const am = maskAt(state, a);
  const bm = maskAt(state, b);
  expect(popcount(pm)).toBe(kind === "xy-wing" ? 2 : 3);
  expect(popcount(am)).toBe(2);
  expect(popcount(bm)).toBe(2);
  expect(am).not.toBe(bm);
  expect(sees(pivot, a)).toBe(true);
  expect(sees(pivot, b)).toBe(true);
  const zMask = am & bm;
  expect(popcount(zMask)).toBe(1);
  const z = maskDigits(zMask)[0]!;
  if (kind === "xy-wing") {
    expect(pm & zMask).toBe(0);
    expect(am | bm).toBe(pm | zMask);
  } else {
    expect(am | bm).toBe(pm);
  }
  expect(step.digits).toEqual(maskDigits(pm | zMask));
  const sources = kind === "xy-wing" ? [a, b] : [pivot, a, b];
  for (const { cell: c, digit } of step.eliminations) {
    expect(digit).toBe(z);
    expect(has(state, c, digit)).toBe(true);
    expect(step.cells).not.toContain(c);
    for (const s of sources) expect(sees(c, s)).toBe(true);
  }
  // The explanation names the pivot and both pincers.
  expect(step.explanation).toContain(`pivot ${cellName(pivot)}`);
  expect(step.explanation).toContain(`pincers ${cellName(a)}`);
  expect(step.explanation).toContain(cellName(b));
  expect(step.explanation).not.toMatch(/\n/);
}

// Pivot r1c1 {1,2}, pincers r1c5 {1,3} (row) and r5c1 {2,3} (column); only r5c5 sees both pincers.
const XY_STATE = () =>
  withMarks([
    [cell(1, 1), [1, 2]],
    [cell(1, 5), [1, 3]],
    [cell(5, 1), [2, 3]],
  ]);
// Pivot r1c1 {1,2,3}, pincers r2c2 {1,3} (box) and r1c7 {2,3} (row); r1c2 and r1c3 see all three.
const XYZ_STATE = () =>
  withMarks([
    [cell(1, 1), [1, 2, 3]],
    [cell(2, 2), [1, 3]],
    [cell(1, 7), [2, 3]],
  ]);

// Found by search: random minimal puzzles that the Expert driver solves but not without the wing.
// This one needs only singles plus XY-Wing.
const XY_PUZZLE = {
  puzzle: "..8.1...4..1...3....35.829.5......6..6.8..9.7.....25..3..6..8.9....5.........9..3",
  solution: "958213674271496385643578291589731462162845937734962518315627849897354126426189753",
};
// Needs XYZ-Wing and never uses XY-Wing.
const XYZ_PUZZLE = {
  puzzle: ".975...1........5.1..2.8..741..3....8....764..5...6..9...4...9.......48.......5.2",
  solution: "397564218268713954145298367416932875829157643753846129632485791571329486984671532",
};

describe("XY-Wing", () => {
  it("finds a pivot with two bivalue pincers and clears the shared digit where they meet", () => {
    const state = XY_STATE();
    expect(nextStep(state, "hard")).toBeNull();
    expect(findXWing(state)).toBeNull();
    expect(findSwordfish(state)).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findXYWing(state));
    expectWingWellFormed(state, step, "xy-wing");
    expect(step.cells).toEqual([cell(1, 1), cell(1, 5), cell(5, 1)]);
    expect(step.digits).toEqual([1, 2, 3]);
    expect(step.eliminations).toEqual([{ cell: cell(5, 5), digit: 3 }]);
    expect(step.explanation).toBe(
      "XY-Wing: pivot r1c1 (1/2) with pincers r1c5 (1/3) and r5c1 (2/3), so one pincer must be 3; " +
        "remove 3 from cells that see both pincers",
    );
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(XY_PUZZLE.puzzle));
    const full = solveLogically(state, "expert");
    expect(full.solved).toBe(true);
    expect(full.steps.some((s) => s.technique === "xy-wing")).toBe(true);
    expect(full.steps.map((s) => s.technique).filter((t) => !t.endsWith("single") && t !== "xy-wing")).toEqual([]);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(XY_PUZZLE.solution);
    expect(solveLogically(state, "expert", registryWithout("xy-wing")).solved).toBe(false);
  });

  it("skips wings with nothing to eliminate and pincers with the same pair", () => {
    let state = eliminate(XY_STATE(), cell(5, 5), 3);
    expect(findXYWing(state)).toBeNull();
    // Both pincers {1,3}: not a wing, since the pivot's 2 forces nothing.
    state = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(1, 5), [1, 3]],
      [cell(5, 1), [1, 3]],
    ]);
    expect(findXYWing(state)).toBeNull();
    // Pincers share 2, which the pivot also holds, so nothing is forced.
    state = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(1, 5), [2, 3]],
      [cell(5, 1), [2, 4]],
    ]);
    expect(findXYWing(state)).toBeNull();
  });

  it("ignores trivalue pivots", () => {
    expect(findXYWing(XYZ_STATE())).toBeNull();
  });
});

describe("XYZ-Wing", () => {
  it("finds a trivalue pivot and clears the shared digit from cells seeing all three", () => {
    const state = XYZ_STATE();
    expect(nextStep(state, "hard")).toBeNull();
    expect(findXWing(state)).toBeNull();
    expect(findXYWing(state)).toBeNull();
    expect(findSwordfish(state)).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findXYZWing(state));
    expectWingWellFormed(state, step, "xyz-wing");
    expect(step.cells).toEqual([cell(1, 1), cell(1, 7), cell(2, 2)]);
    expect(step.digits).toEqual([1, 2, 3]);
    expect(step.eliminations).toEqual([
      { cell: cell(1, 2), digit: 3 },
      { cell: cell(1, 3), digit: 3 },
    ]);
    expect(step.explanation).toBe(
      "XYZ-Wing: pivot r1c1 (1/2/3) with pincers r1c7 (2/3) and r2c2 (1/3), so one of the three must be 3; " +
        "remove 3 from cells that see the pivot and both pincers",
    );
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(XYZ_PUZZLE.puzzle));
    const full = solveLogically(state, "expert");
    expect(full.solved).toBe(true);
    const used = new Set(full.steps.map((s) => s.technique));
    expect(used.has("xyz-wing")).toBe(true);
    expect(used.has("xy-wing")).toBe(false);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(XYZ_PUZZLE.solution);
    expect(solveLogically(state, "expert", registryWithout("xyz-wing")).solved).toBe(false);
  });

  it("does not clear cells that see the pincers but not the pivot", () => {
    // The XY_STATE layout with a trivalue pivot: r5c5 sees both pincers but not r1c1.
    const state = withMarks([
      [cell(1, 1), [1, 2, 3]],
      [cell(1, 5), [1, 3]],
      [cell(5, 1), [2, 3]],
    ]);
    expect(findXYZWing(state)).toBeNull();
  });

  it("ignores bivalue pivots", () => {
    expect(findXYZWing(XY_STATE())).toBeNull();
  });
});

describe("wing finders", () => {
  it("return null on an empty or solved grid and do not mutate their input", () => {
    for (const find of [findXYWing, findXYZWing]) {
      expect(find(fromGrid(emptyGrid()))).toBeNull();
      expect(find(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    }
    for (const state of [XY_STATE(), XYZ_STATE()]) {
      const copy = structuredClone(state);
      findXYWing(state);
      findXYZWing(state);
      expect(state).toEqual(copy);
    }
  });
});

describe("registration", () => {
  it("registers XY-Wing and XYZ-Wing at Expert with their weights", () => {
    const expert = defaultRegistry.list("expert").filter((t) => t.level === "expert");
    expect(expert.map((t) => [t.id, t.weight])).toEqual([
      ["x-wing", 30],
      ["xy-wing", 40],
      ["swordfish", 45],
      ["xyz-wing", 50],
    ]);
    expect(defaultRegistry.list("hard").some((t) => t.id === "xy-wing" || t.id === "xyz-wing")).toBe(false);
  });
});

/**
 * A blanked solved grid with extra candidates removed at random, never the solution digit.
 * Thinning makes bivalue and trivalue cells, and so wings, far more common.
 */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`wings-${seed}`);
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
    const fired = { "xy-wing": 0, "xyz-wing": 0 };
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
            for (const [kind, find] of [
              ["xy-wing", findXYWing],
              ["xyz-wing", findXYZWing],
            ] as const) {
              const step = find(state);
              if (!step) continue;
              fired[kind]++;
              expectWingWellFormed(state, step, kind);
              for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
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
    // Guards against a vacuous pass.
    expect(fired["xy-wing"]).toBeGreaterThan(0);
    expect(fired["xyz-wing"]).toBeGreaterThan(0);
  });
});
