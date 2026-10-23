import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PEERS, emptyGrid, parseGrid, serializeGrid, type CellValue, type Digit } from "./grid";
import { createRng } from "./random";
import { SAMPLE_EASY } from "./samples";
import { solve } from "./solver";
import { isSolved, respectsGivens } from "./validate";

// Hardest-class puzzles with unique solutions, from the published literature.
const HARD_PUZZLES = [
  {
    name: "Arto Inkala 2012",
    puzzle: "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..",
    solution: "812753649943682175675491283154237896369845721287169534521974368438526917796318452",
  },
  {
    name: "AI Escargot (Inkala 2006)",
    puzzle: "1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..",
    solution: "162857493534129678789643521475312986913586742628794135356478219241935867897261354",
  },
  {
    name: "Norvig top95 #1",
    puzzle: "4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......",
    solution: "417369825632158947958724316825437169791586432346912758289643571573291684164875293",
  },
] as const;

const KNOWN = [SAMPLE_EASY, ...HARD_PUZZLES];
const easySolution = parseGrid(SAMPLE_EASY.solution);

describe("solve: known puzzles", () => {
  for (const { name, puzzle, solution } of KNOWN) {
    it(`solves ${name} to its known solution`, () => {
      const result = solve(parseGrid(puzzle));
      expect(result).not.toBeNull();
      expect(serializeGrid(result!)).toBe(solution);
    });

    it(`solves ${name} to the same solution with a seeded rng`, () => {
      expect(serializeGrid(solve(parseGrid(puzzle), createRng(name))!)).toBe(solution);
    });
  }

  it("solves each hard puzzle in under 20 ms (best of 5)", () => {
    // Warm the JIT on unrelated work so the timing measures the search, not V8's interpreter.
    for (let seed = 0; seed < 20; seed++) solve(emptyGrid(), createRng(seed));
    solve(parseGrid(SAMPLE_EASY.puzzle));
    for (const { name, puzzle } of HARD_PUZZLES) {
      // The minimum of several runs discards scheduler noise on busy CI machines.
      let best = Infinity;
      for (let run = 0; run < 5; run++) {
        const grid = parseGrid(puzzle);
        const start = performance.now();
        const result = solve(grid);
        best = Math.min(best, performance.now() - start);
        expect(result, name).not.toBeNull();
      }
      expect(best, `${name} best of 5 took ${best.toFixed(2)} ms`).toBeLessThan(20);
    }
  });

  it("returns a full solved grid unchanged", () => {
    expect(solve(easySolution)).toEqual(easySolution);
  });
});

describe("solve: no solution", () => {
  it("returns null when givens conflict", () => {
    const grid = parseGrid(SAMPLE_EASY.puzzle);
    grid[1] = 5; // r1c1 is already 5
    expect(solve(grid)).toBeNull();
    expect(solve(grid, createRng(1))).toBeNull();
  });

  it("returns null for a conflict-free grid whose empty cell has no candidate", () => {
    // r1c1..r1c8 hold 1-8 and r2c9 holds 9, so r1c9 can take nothing.
    const grid = parseGrid(`12345678. ........9 ${".".repeat(63)}`);
    expect(solve(grid)).toBeNull();
  });

  it("returns null for a conflict-free grid that only fails after a guess", () => {
    // Row 1 leaves {1, 2} for r1c1 and r1c2, but column 1 and column 2 each hold a 2 lower
    // down, so both cells need 1. Each has a candidate; only search exposes the clash.
    const grid = parseGrid(`..3456789 ${".".repeat(18)} 2........ ${".".repeat(18)} .2....... ${".".repeat(18)}`);
    expect(solve(grid)).toBeNull();
    expect(solve(grid, createRng("dead-end"))).toBeNull();
  });

  it("is deterministic without an rng", () => {
    const grid = emptyGrid();
    expect(solve(grid)).toEqual(solve(grid));
  });
});

/** Arbitrary for a subset of cells to blank out of a full grid. */
const blanks = fc.uniqueArray(fc.integer({ min: 0, max: 80 }), { maxLength: 81 });

describe("solve: properties", () => {
  it("never mutates its input", () => {
    fc.assert(
      fc.property(blanks, fc.option(fc.integer()), (cells, seed) => {
        const grid: CellValue[] = easySolution.slice();
        for (const cell of cells) grid[cell] = 0;
        const before = grid.slice();
        solve(Object.freeze(grid), seed === null ? undefined : createRng(seed));
        expect(grid).toEqual(before);
      }),
    );
  });

  it("returns a valid solution that keeps every given, with or without an rng", () => {
    fc.assert(
      fc.property(blanks, fc.option(fc.integer()), (cells, seed) => {
        const grid: CellValue[] = easySolution.slice();
        for (const cell of cells) grid[cell] = 0;
        const result = solve(grid, seed === null ? undefined : createRng(seed));
        expect(result).not.toBeNull();
        expect(isSolved(result!)).toBe(true);
        expect(respectsGivens(result!, grid)).toBe(true);
      }),
    );
  });

  it("builds a valid random full grid from an empty grid, reproducibly per seed", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = solve(emptyGrid(), createRng(seed));
        const b = solve(emptyGrid(), createRng(seed));
        expect(a).not.toBeNull();
        expect(isSolved(a!)).toBe(true);
        expect(a).toEqual(b);
      }),
      { numRuns: 50 },
    );
  });

  it("tries candidates in rng order, so different seeds give different full grids", () => {
    const grids = new Set<string>();
    for (let seed = 0; seed < 20; seed++) grids.add(serializeGrid(solve(emptyGrid(), createRng(seed))!));
    expect(grids.size).toBeGreaterThan(15);
  });

  it("returns null whenever a digit repeats in a row, column or box", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 1, max: 9 }),
        (cell, peerIdx, d) => {
          const grid: CellValue[] = parseGrid(SAMPLE_EASY.puzzle);
          grid[cell] = d as Digit;
          grid[PEERS[cell]![peerIdx]!] = d as Digit;
          expect(solve(grid)).toBeNull();
        },
      ),
    );
  });
});
