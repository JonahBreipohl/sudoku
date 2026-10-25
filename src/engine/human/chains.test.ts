import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, cellIndex, digitBit, emptyGrid, parseGrid, popcount, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, cellName, type Step } from "../step";
import {
  MAX_CHAIN_LINKS,
  buildBivalueLinks,
  buildDigitLinks,
  findXChain,
  findXYChain,
  formatChain,
  formatXYChain,
  nodeCell,
  nodeOf,
  shortestChains,
} from "./chains";
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

function registryWithout(...ids: string[]) {
  const registry = createRegistry();
  for (const t of defaultRegistry.list()) if (!ids.includes(t.id)) registry.register(t.id, t.find);
  return registry;
}

const isConjugate = (state: CandidateState, digit: Digit, a: number, b: number) =>
  UNITS.some((unit) => {
    const holders = unit.filter((c) => has(state, c, digit));
    return holders.length === 2 && holders.includes(a) && holders.includes(b);
  });

/** Checks the X-chain logic against the state directly, independent of how the finder searched. */
function expectXChainWellFormed(state: CandidateState, step: Step): void {
  expect(step.technique).toBe("x-chain");
  expect(step.placements).toEqual([]);
  expect(step.digits).toHaveLength(1);
  const digit = step.digits[0]!;
  const cells = step.cells;
  expect(cells.length % 2).toBe(0);
  expect(cells.length).toBeGreaterThanOrEqual(4);
  expect(cells.length - 1).toBeLessThanOrEqual(MAX_CHAIN_LINKS);
  expect(new Set(cells).size).toBe(cells.length);
  for (const c of cells) expect(has(state, c, digit)).toBe(true);
  for (let i = 0; i + 1 < cells.length; i++) {
    const [x, y] = [cells[i]!, cells[i + 1]!];
    if (i % 2 === 0) expect(isConjugate(state, digit, x, y)).toBe(true);
    else expect(sees(x, y)).toBe(true);
  }
  const a = cells[0]!;
  const b = cells[cells.length - 1]!;
  expect(a).toBeLessThan(b);
  expect(step.eliminations.length).toBeGreaterThan(0);
  const elimCells = step.eliminations.map((e) => e.cell);
  expect(elimCells).toEqual([...elimCells].sort((x, y) => x - y));
  for (const { cell: c, digit: d } of step.eliminations) {
    expect(d).toBe(digit);
    expect(has(state, c, d)).toBe(true);
    expect(c === a || c === b).toBe(false);
    expect(sees(c, a) && sees(c, b)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
  expect(step.explanation).toContain(cellName(a));
  expect(step.explanation).toContain(cellName(b));
  for (const c of elimCells) expect(step.explanation).toContain(cellName(c));
}

// Digit 1 strong along rows 1, 4 and 7 only; columns 5 and 8 give the weak links:
// r1c1 =row 1= r1c5 -column 5- r4c5 =row 4= r4c8 -column 8- r7c8 =row 7= r7c2.
// Every conjugate pair is isolated, so coloring, fish and the shorter 4-cell chains all find
// nothing, and the only elimination needs the whole 6-cell chain.
const LONG_STATE = () =>
  confine(1, [
    [ROW(1), [cell(1, 1), cell(1, 5)]],
    [ROW(4), [cell(4, 5), cell(4, 8)]],
    [ROW(7), [cell(7, 8), cell(7, 2)]],
  ]);
const LONG_CHAIN = [cell(1, 1), cell(1, 5), cell(4, 5), cell(4, 8), cell(7, 8), cell(7, 2)];

// LONG_STATE plus a skyscraper on the same digit: r2c7 =row 2= r2c9 -column 9- r8c9 =row 8= r8c8.
// Its ends see r3c8 and r9c7, so a 4-cell chain exists alongside the 6-cell one (which keeps
// r3c2 and r9c1 to eliminate) and starts at a higher cell.
const SHORT_AND_LONG_STATE = () => {
  let state = LONG_STATE();
  for (const [unit, keep] of [
    [ROW(2), [cell(2, 7), cell(2, 9)]],
    [ROW(8), [cell(8, 9), cell(8, 8)]],
  ] as [number, number[]][]) {
    for (const c of UNITS[unit]!) if (!keep.includes(c)) state = eliminate(state, c, 1);
  }
  return state;
};

// Found by search: a generated puzzle the Master driver solves only with a 6-cell X-chain.
const XCHAIN_PUZZLE = {
  puzzle: "3..8.69.5..5..2.7......4.3..1......4.4..8..6.6......8..5.9......3.6..2..2.85.3..6",
  solution: "374816925165392478982754631813267594547189362629435187756921843431678259298543716",
};

describe("link graph", () => {
  it("builds strong links from conjugate pairs and weak links between peers", () => {
    const graph = buildDigitLinks(LONG_STATE(), 1);
    const n = (r: number, c: number) => nodeOf(cell(r, c), 1);
    expect(graph.strong[n(1, 1)]).toEqual([n(1, 5)]);
    expect(graph.strong[n(4, 5)]).toEqual([n(4, 8)]);
    expect(graph.strong[n(2, 2)]).toEqual([]);
    // r1c5 sees every other 1 in column 5 and box 2, including its strong partner's row.
    expect(graph.weak[n(1, 5)]).toContain(n(4, 5));
    expect(graph.weak[n(1, 5)]).toContain(n(1, 1));
    expect(graph.weak[n(1, 5)]).not.toContain(n(4, 8));
    for (const list of [...graph.strong, ...graph.weak]) expect(list).toEqual([...list].sort((x, y) => x - y));
    // No links for a digit absent from a cell.
    expect(graph.weak[nodeOf(cell(1, 2), 1)]).toEqual([]);
  });

  it("finds the shortest alternating chains from a start, strong link first and last", () => {
    const graph = buildDigitLinks(LONG_STATE(), 1);
    const chains = shortestChains(graph, nodeOf(cell(1, 1), 1));
    expect(chains.map((nodes) => nodes.map(nodeCell))).toEqual([
      [cell(1, 1), cell(1, 5)],
      [cell(1, 1), cell(1, 5), cell(4, 5), cell(4, 8)],
      LONG_CHAIN,
    ]);
    expect(shortestChains(graph, nodeOf(cell(1, 1), 1), 3)).toHaveLength(2);
  });

  it("formats strong links as = and weak links as -", () => {
    expect(formatChain(LONG_CHAIN)).toBe("r1c1 = r1c5 - r4c5 = r4c8 - r7c8 = r7c2");
  });
});

describe("x-chain", () => {
  it("finds a 6-cell chain where every cheaper technique fails", () => {
    const state = LONG_STATE();
    expect(nextStep(state, "expert")).toBeNull();
    expect(nextStep(state, "master", registryWithout("x-chain", "xy-chain"))).toBeNull();
    const step = nextStep(state, "master")!;
    expect(step).toEqual(findXChain(state));
    expectXChainWellFormed(state, step);
    expect(step.cells).toEqual(LONG_CHAIN);
    expect(step.digits).toEqual([1]);
    expect(step.eliminations).toEqual([
      { cell: cell(2, 2), digit: 1 },
      { cell: cell(3, 2), digit: 1 },
      { cell: cell(8, 1), digit: 1 },
      { cell: cell(9, 1), digit: 1 },
    ]);
    expect(step.explanation).toBe(
      "X-Chain on 1: r1c1 = r1c5 - r4c5 = r4c8 - r7c8 = r7c2; one of r1c1 and r7c2 must be 1, " +
        "so remove 1 from r2c2, r3c2, r8c1, r9c1",
    );
  });

  it("prefers a shorter chain over a longer one, even at a higher start cell", () => {
    const state = SHORT_AND_LONG_STATE();
    const step = findXChain(state)!;
    expectXChainWellFormed(state, step);
    expect(step.cells).toEqual([cell(2, 7), cell(2, 9), cell(8, 9), cell(8, 8)]);
    expect(step.eliminations).toEqual([
      { cell: cell(3, 8), digit: 1 },
      { cell: cell(9, 7), digit: 1 },
    ]);
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(XCHAIN_PUZZLE.puzzle));
    const full = solveLogically(state, "master");
    expect(full.solved).toBe(true);
    const chains = full.steps.filter((s) => s.technique === "x-chain");
    expect(chains.some((s) => s.cells.length >= 6)).toBe(true);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(XCHAIN_PUZZLE.solution);
    expect(solveLogically(state, "master", registryWithout("x-chain", "xy-chain")).solved).toBe(false);
  });

  it("finds nothing once the chain's eliminations are gone", () => {
    let state = LONG_STATE();
    for (const c of [cell(2, 2), cell(3, 2), cell(8, 1), cell(9, 1)]) state = eliminate(state, c, 1);
    expect(findXChain(state)).toBeNull();
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findXChain(fromGrid(emptyGrid()))).toBeNull();
    expect(findXChain(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = LONG_STATE();
    const copy = structuredClone(state);
    findXChain(state);
    expect(state).toEqual(copy);
  });
});

/** Empty-grid candidates with the listed cells cut down to exactly the given digits. */
function withMarks(marks: [number, Digit[]][]): CandidateState {
  let state: CandidateState = fromGrid(emptyGrid());
  for (const [c, keep] of marks) for (const d of DIGITS) if (!keep.includes(d)) state = eliminate(state, c, d);
  return state;
}
const maskAt = (state: CandidateState, c: number) => (state.values[c] === 0 ? (state.candidates[c] ?? 0) : 0);

/** Checks the XY-chain logic against the state directly: walks the cells forcing digits along. */
function expectXYChainWellFormed(state: CandidateState, step: Step): void {
  expect(step.technique).toBe("xy-chain");
  expect(step.placements).toEqual([]);
  expect(step.digits).toHaveLength(1);
  const digit = step.digits[0]!;
  const cells = step.cells;
  expect(cells.length).toBeGreaterThanOrEqual(3);
  expect(2 * cells.length - 1).toBeLessThanOrEqual(MAX_CHAIN_LINKS);
  expect(new Set(cells).size).toBe(cells.length);
  // Assume the first cell is not `digit`; each cell then forces the next off the shared digit.
  let banned: Digit = digit;
  for (let i = 0; i < cells.length; i++) {
    const m = maskAt(state, cells[i]!);
    expect(popcount(m)).toBe(2);
    expect(m & digitBit(banned)).not.toBe(0);
    if (i > 0) expect(sees(cells[i - 1]!, cells[i]!)).toBe(true);
    banned = DIGITS.find((d) => d !== banned && (m & digitBit(d)) !== 0)!;
  }
  // ... and the last cell lands on `digit`.
  expect(banned).toBe(digit);
  const a = cells[0]!;
  const b = cells[cells.length - 1]!;
  expect(a).toBeLessThan(b);
  expect(step.eliminations.length).toBeGreaterThan(0);
  const elimCells = step.eliminations.map((e) => e.cell);
  expect(elimCells).toEqual([...elimCells].sort((x, y) => x - y));
  for (const { cell: c, digit: d } of step.eliminations) {
    expect(d).toBe(digit);
    expect(has(state, c, d)).toBe(true);
    expect(c === a || c === b).toBe(false);
    expect(sees(c, a) && sees(c, b)).toBe(true);
  }
  expect(step.explanation).not.toMatch(/\n/);
  expect(step.explanation).toContain(cellName(a));
  expect(step.explanation).toContain(cellName(b));
  for (const c of elimCells) expect(step.explanation).toContain(cellName(c));
}

// r1c1 (1=2) - r1c5 (2=3) - r5c5 (3=4) - r5c9 (4=1): one of r1c1 and r5c9 is 1, so r1c9 and
// r5c1 lose 1. No two of the cells share a pair or form an XY-Wing, and every other candidate is
// left in place, so nothing cheaper applies.
const XY_MARKS: [number, Digit[]][] = [
  [cell(1, 1), [1, 2]],
  [cell(1, 5), [2, 3]],
  [cell(5, 5), [3, 4]],
  [cell(5, 9), [1, 4]],
];
const XY_CHAIN = [cell(1, 1), cell(1, 5), cell(5, 5), cell(5, 9)];

// XY_MARKS plus a 3-cell chain on 5 elsewhere, which is shorter and wins although it starts later:
// r7c1 (5=6) - r7c9 (6=7) - r9c9 (7=5), whose ends both see r7c7, r7c8 (row 7 and box 9)
// and r9c1..r9c3 (box 7 and row 9). It is also an XY-Wing, but the finder itself does not care.
const XY_SHORT_MARKS: [number, Digit[]][] = [
  ...XY_MARKS,
  [cell(7, 1), [5, 6]],
  [cell(7, 9), [6, 7]],
  [cell(9, 9), [5, 7]],
];

// Found by search: a generated puzzle the Master driver solves only with a 4-cell XY-chain.
const XYCHAIN_PUZZLE = {
  puzzle: "..8...59...4....82.1..9..3......4.13..57.19..64.3......8..5..2.45....8...73...1..",
  solution: "768432591934175682512896437897564213325781946641329758189657324456213879273948165",
};

describe("xy-chain", () => {
  it("builds strong links inside bivalue cells and weak links between bivalue peers", () => {
    const state = withMarks(XY_MARKS);
    const graph = buildBivalueLinks(state);
    const n = (r: number, c: number, d: Digit) => nodeOf(cell(r, c), d);
    expect(graph.strong[n(1, 1, 1)]).toEqual([n(1, 1, 2)]);
    expect(graph.strong[n(1, 5, 3)]).toEqual([n(1, 5, 2)]);
    expect(graph.weak[n(1, 1, 2)]).toEqual([n(1, 5, 2)]);
    expect(graph.weak[n(1, 5, 3)]).toEqual([n(5, 5, 3)]);
    // Cells with more than two candidates get no nodes.
    expect(graph.strong[n(1, 9, 1)]).toEqual([]);
    expect(graph.weak[n(1, 1, 1)]).toEqual([]);
  });

  it("formats each cell with the digit it gives up and the one it is forced to", () => {
    const n = (r: number, c: number, d: Digit) => nodeOf(cell(r, c), d);
    expect(formatXYChain([n(1, 1, 1), n(1, 1, 2), n(1, 5, 2), n(1, 5, 3)])).toBe("r1c1 (1=2) - r1c5 (2=3)");
  });

  it("finds a 4-cell chain where every cheaper technique fails", () => {
    const state = withMarks(XY_MARKS);
    expect(nextStep(state, "expert")).toBeNull();
    expect(nextStep(state, "master", registryWithout("xy-chain"))).toBeNull();
    const step = nextStep(state, "master")!;
    expect(step).toEqual(findXYChain(state));
    expectXYChainWellFormed(state, step);
    expect(step.cells).toEqual(XY_CHAIN);
    expect(step.digits).toEqual([1]);
    expect(step.eliminations).toEqual([
      { cell: cell(1, 9), digit: 1 },
      { cell: cell(5, 1), digit: 1 },
    ]);
    expect(step.explanation).toBe(
      "XY-Chain on 1: r1c1 (1=2) - r1c5 (2=3) - r5c5 (3=4) - r5c9 (4=1); one of r1c1 and r5c9 must be 1, " +
        "so remove 1 from r1c9, r5c1",
    );
  });

  it("prefers a shorter chain over a longer one, even at a higher digit and start cell", () => {
    const state = withMarks(XY_SHORT_MARKS);
    const step = findXYChain(state)!;
    expectXYChainWellFormed(state, step);
    expect(step.cells).toEqual([cell(7, 1), cell(7, 9), cell(9, 9)]);
    expect(step.eliminations.map((e) => e.cell)).toEqual([cell(7, 7), cell(7, 8), cell(9, 1), cell(9, 2), cell(9, 3)]);
  });

  it("is required to solve a known puzzle", () => {
    const state = fromGrid(parseGrid(XYCHAIN_PUZZLE.puzzle));
    const full = solveLogically(state, "master");
    expect(full.solved).toBe(true);
    const chains = full.steps.filter((s) => s.technique === "xy-chain");
    expect(chains.some((s) => s.cells.length >= 4)).toBe(true);
    expect(full.steps.reduce(applyStep, state).values.join("")).toBe(XYCHAIN_PUZZLE.solution);
    expect(solveLogically(state, "master", registryWithout("xy-chain")).solved).toBe(false);
  });

  it("finds nothing once the chain's eliminations are gone, or with only two cells", () => {
    let state = withMarks(XY_MARKS);
    for (const c of [cell(1, 9), cell(5, 1)]) state = eliminate(state, c, 1);
    expect(findXYChain(state)).toBeNull();
    // A naked pair is a two-cell chain; it is left to the naked pair finder.
    expect(findXYChain(withMarks([[cell(1, 1), [1, 2]], [cell(1, 5), [1, 2]]]))).toBeNull();
  });

  it("returns null on an empty or solved grid and does not mutate its input", () => {
    expect(findXYChain(fromGrid(emptyGrid()))).toBeNull();
    expect(findXYChain(fromGrid(parseGrid(SAMPLE_EASY.solution)))).toBeNull();
    const state = withMarks(XY_MARKS);
    const copy = structuredClone(state);
    findXYChain(state);
    expect(state).toEqual(copy);
  });
});

// A single wall-clock maximum flakes when vitest runs files in parallel and a call gets descheduled,
// so the typical cost is held to 50 ms (median) and only a blow-up trips the generous hard ceiling.
const MEDIAN_BUDGET_MS = 50;
const HARD_CEILING_MS = 500;
function expectTimingsBounded(times: number[]): void {
  const sorted = [...times].sort((a, b) => a - b);
  expect(sorted[Math.floor(sorted.length / 2)] ?? 0).toBeLessThan(MEDIAN_BUDGET_MS);
  expect(sorted[sorted.length - 1] ?? 0).toBeLessThan(HARD_CEILING_MS);
}

describe("bounds", () => {
  it("runs under 50 ms (median) on dense and chain-rich states", () => {
    const states = [fromGrid(emptyGrid()), LONG_STATE(), SHORT_AND_LONG_STATE(), fromGrid(parseGrid(XCHAIN_PUZZLE.puzzle))];
    states.push(withMarks(XY_SHORT_MARKS), fromGrid(parseGrid(XYCHAIN_PUZZLE.puzzle)));
    for (const find of [findXChain, findXYChain]) {
      for (const state of states) find(state); // warm up the JIT
      const times: number[] = [];
      for (const state of states) {
        const t0 = performance.now();
        find(state);
        times.push(performance.now() - t0);
      }
      expectTimingsBounded(times);
    }
  });
});

describe("registration", () => {
  it("registers X-Chain at Master with weight 60", () => {
    const t = defaultRegistry.list("master").find((x) => x.id === "x-chain");
    expect(t).toMatchObject({ level: "master", weight: 60, name: "X-Chain" });
    expect(defaultRegistry.list("expert").some((x) => x.id === "x-chain")).toBe(false);
  });

  it("registers XY-Chain at Master with weight 70", () => {
    const t = defaultRegistry.list("master").find((x) => x.id === "xy-chain");
    expect(t).toMatchObject({ level: "master", weight: 70, name: "XY-Chain" });
    expect(defaultRegistry.list("expert").some((x) => x.id === "xy-chain")).toBe(false);
  });
});

/** A blanked solved grid with extra non-solution candidates removed at random, to make chains common. */
function thinned(seed: number, holes: number, removals: number): { state: CandidateState; solution: CellValue[] } {
  const rng = createRng(`xchain-${seed}`);
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
  it("X- and XY-chains never eliminate a solution digit and run within the time bounds, at any state along a Master solve", () => {
    let fired = 0;
    let firedXY = 0;
    const times: number[] = [];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 40, max: 64 }),
        fc.integer({ min: 0, max: 200 }),
        (seed, holes, removals) => {
          const { state: start, solution } = thinned(seed, holes, removals);
          let state = start;
          for (;;) {
            // Call the finder at every state, since cheaper steps usually win in the driver.
            const t0 = performance.now();
            const own = findXChain(state);
            times.push(performance.now() - t0);
            if (own) {
              fired++;
              expectXChainWellFormed(state, own);
              for (const { cell: c, digit } of own.eliminations) expect(digit).not.toBe(solution[c]);
            }
            const t1 = performance.now();
            const xy = findXYChain(state);
            times.push(performance.now() - t1);
            if (xy) {
              firedXY++;
              expectXYChainWellFormed(state, xy);
              for (const { cell: c, digit } of xy.eliminations) expect(digit).not.toBe(solution[c]);
            }
            const step = nextStep(state, "master");
            if (!step) break;
            for (const { cell: c, digit } of step.eliminations) expect(digit).not.toBe(solution[c]);
            state = applyStep(state, step);
          }
        },
      ),
      { numRuns: 30 },
    );
    // Guards against a vacuous pass.
    expect(fired).toBeGreaterThan(0);
    expect(firedXY).toBeGreaterThan(0);
    expectTimingsBounded(times);
  });
});
