import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, cellIndex, digitBit, emptyGrid, parseGrid, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, cellName, type Step } from "../step";
import { findSimpleColoring } from "./coloring";
import { nextStep, solveLogically } from "./driver";
import { createRegistry, defaultRegistry } from "./registry";
import "./techniques";

const cell = (r: number, c: number) => cellIndex(r - 1, c - 1);
const sees = (a: number, b: number) => PEERS[a]!.includes(b);
const has = (state: CandidateState, c: number, digit: Digit) =>
  state.values[c] === 0 && ((state.candidates[c] ?? 0) & digitBit(digit)) !== 0;

/** Empty-grid candidates where `digit` stays only at `keep` within each listed unit. */
function confine(digit: Digit, units: [number, number[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [unit, keep] of units) {
    for (const c of UNITS[unit]!) if (!keep.includes(c)) state = eliminate(state, c, digit);
  }
  return state;
}
const ROW = (r: number) => r - 1;
const COL = (c: number) => 9 + c - 1;

function registryWithout(...ids: string[]) {
  const registry = createRegistry();
  for (const t of defaultRegistry.list()) if (!ids.includes(t.id)) registry.register(t.id, t.find);
  return registry;
}

/** Checks the coloring invariant directly against the state, independent of how the finder searched. */
function expectColoringWellFormed(state: CandidateState, step: Step): "wrap" | "trap" {
  expect(step.technique).toBe("simple-coloring");
  expect(step.placements).toEqual([]);
  expect(step.eliminations.length).toBeGreaterThan(0);
  expect(step.digits).toHaveLength(1);
  const digit = step.digits[0]!;
  expect(step.groups).toHaveLength(2);
  const [a, b] = step.groups as [number[], number[]];
  expect(a.length).toBeGreaterThan(0);
  expect(b.length).toBeGreaterThan(0);
  expect(step.cells).toEqual([...a, ...b].sort((x, y) => x - y));
  expect(new Set(step.cells).size).toBe(step.cells.length);
  expect(Math.min(...a)).toBe(step.cells[0]);
  const colorOf = new Map<number, number>([...a.map((c) => [c, 0] as const), ...b.map((c) => [c, 1] as const)]);
  for (const c of step.cells) expect(has(state, c, digit)).toBe(true);
  // Every conjugate pair touching the chain lies inside it with one end of each color, so one
  // whole color is the digit.
  for (const unit of UNITS) {
    const holders = unit.filter((c) => has(state, c, digit));
    if (holders.length !== 2) continue;
    const [x, y] = holders as [number, number];
    if (!colorOf.has(x) && !colorOf.has(y)) continue;
    expect(colorOf.has(x) && colorOf.has(y)).toBe(true);
    expect(colorOf.get(x)).not.toBe(colorOf.get(y));
  }
  for (const { cell: c, digit: d } of step.eliminations) {
    expect(d).toBe(digit);
    expect(has(state, c, d)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
  const elimCells = step.eliminations.map((e) => e.cell);
  if (step.explanation.includes("color wrap")) {
    const group = elimCells.every((c) => a.includes(c)) ? a : b;
    expect(elimCells).toEqual(group);
    expect(group.some((x) => group.some((y) => x !== y && sees(x, y)))).toBe(true);
    return "wrap";
  }
  expect(step.explanation).toContain("color trap");
  for (const c of elimCells) {
    expect(colorOf.has(c)).toBe(false);
    expect(a.some((x) => sees(c, x))).toBe(true);
    expect(b.some((y) => sees(c, y))).toBe(true);
  }
  return "trap";
}

// Digit 1 conjugate along r1c1 -row 1- r1c5 -column 5- r5c5 -row 5- r5c2 -column 2- r2c2. r1c1 and
// r2c2 get the same color and share box 1, so that color (r1c1, r2c2, r5c5) cannot be 1.
const WRAP_STATE = () =>
  confine(1, [
    [ROW(1), [cell(1, 1), cell(1, 5)]],
    [COL(5), [cell(1, 5), cell(5, 5)]],
    [ROW(5), [cell(5, 5), cell(5, 2)]],
    [COL(2), [cell(5, 2), cell(2, 2)]],
  ]);
// Digit 1 conjugate along r1c1 -row 1- r1c5 -column 5- r5c5 -row 5- r5c2. r1c1 and r5c2 have
// opposite colors; r2c2, r3c2 (box 1 and column 2) and r4c1, r6c1 (column 1 and box 4) see both.
const TRAP_STATE = () =>
  confine(1, [
    [ROW(1), [cell(1, 1), cell(1, 5)]],
    [COL(5), [cell(1, 5), cell(5, 5)]],
    [ROW(5), [cell(5, 5), cell(5, 2)]],
  ]);

// Found by search: random minimal puzzles the Expert driver solves but not without coloring.
// Needs only singles plus color wraps.
const WRAP_PUZZLE = {
  puzzle: "..6...19.4.........92..3..........7.2.1.5..43...7.6....1..7.8..638..9..1....3....",
  solution: "356287194487195362192463587965314278271958643843726915514672839638549721729831456",
};
// Needs locked candidates plus color traps.
const TRAP_PUZZLE = {
  puzzle: ".5...692..........7...9..4.96...72...1.6.3..4........8..7...6.2....7983.52...1...",
  solution: "154836927239754186786192543963487251815623794472915368397548612641279835528361479",
};

describe("simple coloring: color wrap", () => {
  it("removes the digit from the whole color that sees itself", () => {
    const state = WRAP_STATE();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findSimpleColoring(state));
    expect(expectColoringWellFormed(state, step)).toBe("wrap");
    expect(step.groups).toEqual([
      [cell(1, 1), cell(2, 2), cell(5, 5)],
      [cell(1, 5), cell(5, 2)],
    ]);
    expect(step.cells).toEqual([cell(1, 1), cell(1, 5), cell(2, 2), cell(5, 2), cell(5, 5)]);
    expect(step.digits).toEqual([1]);
    expect(step.eliminations).toEqual([
      { cell: cell(1, 1), digit: 1 },
      { cell: cell(2, 2), digit: 1 },
      { cell: cell(5, 5), digit: 1 },
    ]);
    expect(step.explanation).toBe(
      "Simple Coloring on 1: conjugate pairs color r1c1, r2c2, r5c5 one way and r1c5, r5c2 the other; " +
        "r1c1 and r2c2 share a color and see each other (color wrap), so remove 1 from r1c1, r2c2, r5c5",
    );
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(WRAP_PUZZLE.puzzle));
    const full = solveLogically(state, "expert");
    expect(full.solved).toBe(true);
    const coloring = full.steps.filter((s) => s.technique === "simple-coloring");
    expect(coloring.length).toBeGreaterThan(0);
    for (const s of coloring) expect(s.explanation).toContain("color wrap");
    expect(full.steps.map((s) => s.technique).filter((t) => !t.endsWith("single") && t !== "simple-coloring")).toEqual([]);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(WRAP_PUZZLE.solution);
    expect(solveLogically(state, "expert", registryWithout("simple-coloring")).solved).toBe(false);
  });
});

describe("simple coloring: color trap", () => {
  it("removes the digit from cells that see both colors", () => {
    const state = TRAP_STATE();
    expect(nextStep(state, "hard")).toBeNull();
    const step = nextStep(state, "expert")!;
    expect(step).toEqual(findSimpleColoring(state));
    expect(expectColoringWellFormed(state, step)).toBe("trap");
    expect(step.groups).toEqual([
      [cell(1, 1), cell(5, 5)],
      [cell(1, 5), cell(5, 2)],
    ]);
    expect(step.eliminations).toEqual([
      { cell: cell(2, 2), digit: 1 },
      { cell: cell(3, 2), digit: 1 },
      { cell: cell(4, 1), digit: 1 },
      { cell: cell(6, 1), digit: 1 },
    ]);
    expect(step.explanation).toBe(
      "Simple Coloring on 1: conjugate pairs color r1c1, r5c5 one way and r1c5, r5c2 the other; " +
        "one color must be 1 (color trap), so remove 1 from cells that see both colors",
    );
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(TRAP_PUZZLE.puzzle));
    const full = solveLogically(state, "expert");
    expect(full.solved).toBe(true);
    const coloring = full.steps.filter((s) => s.technique === "simple-coloring");
    expect(coloring.length).toBeGreaterThan(0);
    for (const s of coloring) expect(s.explanation).toContain("color trap");
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(TRAP_PUZZLE.solution);
    expect(solveLogically(state, "expert", registryWithout("simple-coloring")).solved).toBe(false);
  });

  it("finds nothing when no cell sees both colors", () => {
    let state = TRAP_STATE();
    for (const c of [cell(2, 2), cell(3, 2), cell(4, 1), cell(6, 1)]) state = eliminate(state, c, 1);
    expect(findSimpleColoring(state)).toBeNull();
  });
});

describe("simple coloring finder", () => {
  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findSimpleColoring(fromGrid(emptyGrid()))).toBeNull();
    expect(findSimpleColoring(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    for (const state of [WRAP_STATE(), TRAP_STATE()]) {
      const copy = structuredClone(state);
      findSimpleColoring(state);
      expect(state).toEqual(copy);
    }
  });

  it("names every chain cell in the explanation", () => {
    const step = findSimpleColoring(WRAP_STATE())!;
    for (const c of step.cells) expect(step.explanation).toContain(cellName(c));
  });
});

describe("registration", () => {
  it("registers Simple Coloring at Expert with weight 45", () => {
    const t = defaultRegistry.list("expert").find((x) => x.id === "simple-coloring");
    expect(t).toMatchObject({ level: "expert", weight: 45, name: "Simple Coloring" });
    expect(defaultRegistry.list("hard").some((x) => x.id === "simple-coloring")).toBe(false);
  });
});

/**
 * A blanked solved grid with extra candidates removed at random, never the solution digit.
 * Thinning makes conjugate pairs, and so coloring chains, far more common.
 */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`coloring-${seed}`);
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
    const fired = { wrap: 0, trap: 0 };
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 40, max: 64 }),
        fc.integer({ min: 0, max: 200 }),
        (seed, holes, removals) => {
          const { state: start, solution } = thinned(seed, holes, removals);
          let state = start;
          for (;;) {
            // Call the finder directly at every state, since cheaper steps usually win in the driver.
            const own = findSimpleColoring(state);
            if (own) {
              fired[expectColoringWellFormed(state, own)]++;
              for (const { cell: c, digit } of own.eliminations) expect(digit).not.toBe(solution[c]);
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
    // Guards against a vacuous pass: both rules fire at least once.
    expect(fired.wrap).toBeGreaterThan(0);
    expect(fired.trap).toBeGreaterThan(0);
  });
});
