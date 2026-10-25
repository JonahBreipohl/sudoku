import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, cellIndex, digitBit, emptyGrid, parseGrid, popcount, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, type Step } from "../step";
import { nextStep, solveLogically } from "./driver";
import { createRegistry, defaultRegistry } from "./registry";
import { findWWing } from "./wwing";
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

/** Removes a digit from every cell of a unit except the listed ones. */
function onlyIn(state: CandidateState, unit: number, digit: Digit, keep: number[]): CandidateState {
  let s = state;
  for (const c of UNITS[unit]!) if (!keep.includes(c) && has(s, c, digit)) s = eliminate(s, c, digit);
  return s;
}

function registryWithout(...ids: string[]) {
  const registry = createRegistry();
  for (const t of defaultRegistry.list()) if (!ids.includes(t.id)) registry.register(t.id, t.find);
  return registry;
}

/** Checks the W-Wing invariant directly against the state. */
function expectWWingWellFormed(state: CandidateState, step: Step): void {
  expect(step.technique).toBe("w-wing");
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.cells).toHaveLength(4);
  expect(step.units).toHaveLength(1);
  const [a, b, p, q] = step.cells as [number, number, number, number];
  const [x, y] = step.digits as [Digit, Digit];
  const pair = maskAt(state, a);
  expect(popcount(pair)).toBe(2);
  expect(maskAt(state, b)).toBe(pair);
  expect(pair).toBe(digitBit(x) | digitBit(y));
  expect(sees(a, b)).toBe(false);
  // The strong link: x fits only in p and q within the unit.
  const unit = UNITS[step.units![0]!]!;
  expect(unit.filter((c) => has(state, c, x)).sort((m, n) => m - n)).toEqual([p, q].sort((m, n) => m - n));
  expect(sees(p, a)).toBe(true);
  expect(sees(q, b)).toBe(true);
  for (const { cell: c, digit } of step.eliminations) {
    expect(digit).toBe(y);
    expect(has(state, c, y)).toBe(true);
    expect(c === a || c === b).toBe(false);
    expect(sees(c, a) && sees(c, b)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
}

// A = r1c1 {1,2}, B = r5c9 {1,2}; 1 in row 9 only at r9c1 (sees A) and r9c9 (sees B).
// r1c9 and r5c1 see both A and B, so 2 goes from them.
const WW_STATE = () => {
  const s = withMarks([
    [cell(1, 1), [1, 2]],
    [cell(5, 9), [1, 2]],
  ]);
  return onlyIn(s, 8, 1, [cell(9, 1), cell(9, 9)]);
};

// Found by random search: a minimal puzzle the Master driver solves, but not without W-Wing.
const WW_PUZZLE = {
  puzzle: "....9..87..56.31....1....69..45....2...2.4....23...9..5..9.8...1.2.....6.........",
  solution: "236491587895673124471852369714569832958234671623187945567928413182345796349716258",
};

describe("W-Wing", () => {
  it("finds two equal pairs joined by a strong link and clears the other digit where they meet", () => {
    const state = WW_STATE();
    const step = findWWing(state)!;
    expectWWingWellFormed(state, step);
    expect(step.cells).toEqual([cell(1, 1), cell(5, 9), cell(9, 1), cell(9, 9)]);
    expect(step.digits).toEqual([1, 2]);
    expect(step.units).toEqual([8]);
    expect(step.eliminations).toEqual([
      { cell: cell(1, 9), digit: 2 },
      { cell: cell(5, 1), digit: 2 },
    ]);
    expect(step.explanation).toBe(
      "W-Wing: r1c1 and r5c9 are both 1/2, and 1 in row 9 must be in r9c1 or r9c9, so one of them is 2; " +
        "remove 2 from cells that see both",
    );
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(WW_PUZZLE.puzzle));
    expect(solveLogically(state, "expert").solved).toBe(false);
    const full = solveLogically(state, "master");
    expect(full.solved).toBe(true);
    expect(full.steps.some((s) => s.technique === "w-wing")).toBe(true);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(WW_PUZZLE.solution);
    // An XY-chain can make the same eliminations in this puzzle, so drop it too to show the
    // puzzle needs a W-Wing rather than anything cheaper.
    expect(solveLogically(state, "master", registryWithout("w-wing", "xy-chain")).solved).toBe(false);
  });

  it("needs a strong link: a third holder of 1 in the unit breaks it", () => {
    const s = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(5, 9), [1, 2]],
    ]);
    // Row 9 keeps 1 in three cells; no other unit has exactly two 1s reaching both cells.
    expect(findWWing(onlyIn(s, 8, 1, [cell(9, 1), cell(9, 5), cell(9, 9)]))).toBeNull();
  });

  it("skips different pairs, mutually visible pairs and wings with nothing to eliminate", () => {
    let state = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(5, 9), [1, 3]],
    ]);
    expect(findWWing(onlyIn(state, 8, 1, [cell(9, 1), cell(9, 9)]))).toBeNull();
    // Same row: a naked pair, not a W-Wing.
    state = withMarks([
      [cell(1, 1), [1, 2]],
      [cell(1, 9), [1, 2]],
    ]);
    expect(findWWing(onlyIn(state, 8, 1, [cell(9, 1), cell(9, 9)]))).toBeNull();
    state = eliminate(eliminate(WW_STATE(), cell(1, 9), 2), cell(5, 1), 2);
    expect(findWWing(state)).toBeNull();
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findWWing(fromGrid(emptyGrid()))).toBeNull();
    expect(findWWing(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = WW_STATE();
    const copy = structuredClone(state);
    findWWing(state);
    expect(state).toEqual(copy);
  });

  it("is registered at Master with weight 55", () => {
    const w = defaultRegistry.list("master").find((t) => t.id === "w-wing");
    expect(w).toMatchObject({ level: "master", weight: 55 });
    expect(defaultRegistry.list("expert").some((t) => t.id === "w-wing")).toBe(false);
  });
});

/** A blanked solved grid with extra non-solution candidates removed at random, so pairs are common. */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`wwing-${seed}`);
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
  it("never eliminates a solution digit, at any state along a Master solve", () => {
    let fired = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 40, max: 64 }),
        fc.integer({ min: 0, max: 200 }),
        (seed, holes, removals) => {
          const { state: start, solution } = thinned(seed, holes, removals);
          let state = start;
          for (;;) {
            const ww = findWWing(state);
            if (ww) {
              fired++;
              expectWWingWellFormed(state, ww);
              for (const { cell: c, digit } of ww.eliminations) expect(digit).not.toBe(solution[c]);
            }
            const step = nextStep(state, "master");
            if (!step) break;
            for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
            state = applyStep(state, step);
          }
        },
      ),
      { numRuns: 40 },
    );
    // Guards against a vacuous pass.
    expect(fired).toBeGreaterThan(0);
  });
});
