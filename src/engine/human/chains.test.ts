import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, type CandidateState } from "../candidates";
import { DIGITS, PEERS, UNITS, cellIndex, digitBit, emptyGrid, parseGrid, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { applyStep, cellName, type Step } from "../step";
import { MAX_CHAIN_LINKS, buildDigitLinks, findXChain, formatChain, nodeCell, nodeOf, shortestChains } from "./chains";
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

describe("bounds", () => {
  it("runs under 50 ms on dense and chain-rich states", () => {
    const states = [fromGrid(emptyGrid()), LONG_STATE(), SHORT_AND_LONG_STATE(), fromGrid(parseGrid(XCHAIN_PUZZLE.puzzle))];
    for (const state of states) findXChain(state); // warm up the JIT
    for (const state of states) {
      const t0 = performance.now();
      findXChain(state);
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});

describe("registration", () => {
  it("registers X-Chain at Master with weight 60", () => {
    const t = defaultRegistry.list("master").find((x) => x.id === "x-chain");
    expect(t).toMatchObject({ level: "master", weight: 60, name: "X-Chain" });
    expect(defaultRegistry.list("expert").some((x) => x.id === "x-chain")).toBe(false);
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
  it("never eliminates a solution digit and runs under 50 ms, at any state along a Master solve", () => {
    let fired = 0;
    let slowest = 0;
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
            slowest = Math.max(slowest, performance.now() - t0);
            if (own) {
              fired++;
              expectXChainWellFormed(state, own);
              for (const { cell: c, digit } of own.eliminations) expect(digit).not.toBe(solution[c]);
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
    expect(slowest).toBeLessThan(50);
  });
});
