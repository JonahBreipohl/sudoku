import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PEERS, emptyGrid, parseGrid, serializeGrid, type CellValue, type Digit } from "./grid";
import { createRng } from "./random";
import { SAMPLE_EASY } from "./samples";
import { countSolutions, findSolutions, hasUniqueSolution, solve } from "./solver";
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

// 17-clue puzzles (the minimum for a unique solution). Removing any clue from one leaves 16,
// and no 16-clue puzzle is unique (McGuire, Tugemann and Civario 2012), so each yields a known
// non-unique puzzle.
const SEVENTEEN_CLUE = [
  {
    name: "Royle 17-clue #1",
    puzzle: ".......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...",
    solution: "693784512487512936125963874932651487568247391741398625319475268856129743274836159",
  },
  {
    // Built so plain backtracking in row order hits its worst case (the first row is 987654321).
    name: "anti-backtracking 17-clue",
    puzzle: "..............3.85..1.2.......5.7.....4...1...9.......5......73..2.1........4...9",
    solution: "987654321246173985351928746128537694634892157795461832519286473472319568863745219",
  },
] as const;

/**
 * Blanks the first deadly rectangle in a full grid: two rows and two columns spanning exactly
 * two boxes whose corners read a b / b a. Swapping a and b gives a second valid grid and nothing
 * else changes, so the result has exactly two solutions.
 */
function blankDeadlyRectangle(full: readonly CellValue[]): CellValue[] | null {
  for (let r1 = 0; r1 < 9; r1++)
    for (let r2 = r1 + 1; r2 < 9; r2++)
      for (let c1 = 0; c1 < 9; c1++)
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const sameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
          const sameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
          if (sameBand === sameStack) continue;
          const [a, b, c, d] = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          if (full[a] === full[d] && full[b] === full[c]) {
            const grid = full.slice();
            for (const cell of [a, b, c, d]) grid[cell] = 0;
            return grid;
          }
        }
  return null;
}

describe("countSolutions: known puzzles", () => {
  for (const { name, puzzle, solution } of [...KNOWN, ...SEVENTEEN_CLUE]) {
    it(`finds exactly one solution for ${name}`, () => {
      const grid = parseGrid(puzzle);
      expect(countSolutions(grid)).toBe(1);
      expect(countSolutions(grid, 10)).toBe(1);
      expect(hasUniqueSolution(grid)).toBe(true);
      expect(findSolutions(grid, 5).map(serializeGrid)).toEqual([solution]);
    });
  }

  for (const { name, puzzle } of SEVENTEEN_CLUE) {
    it(`reaches the limit once any clue of ${name} is removed`, () => {
      const grid = parseGrid(puzzle);
      const givens = grid.flatMap((v, cell) => (v ? [cell] : []));
      expect(givens).toHaveLength(17);
      for (const cell of givens) {
        const sixteen = grid.slice();
        sixteen[cell] = 0;
        expect(countSolutions(sixteen), `without r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`).toBe(2);
        expect(hasUniqueSolution(sixteen)).toBe(false);
      }
    });
  }

  it("counts exactly two solutions for a blanked deadly rectangle", () => {
    const grid = blankDeadlyRectangle(easySolution);
    expect(grid).not.toBeNull();
    expect(countSolutions(grid!, 100)).toBe(2);
    const found = findSolutions(grid!, 100);
    expect(found).toHaveLength(2);
    expect(found.map(serializeGrid)).toContain(SAMPLE_EASY.solution);
  });

  it("stops at the limit on the empty grid", () => {
    for (const limit of [1, 2, 3, 50]) {
      expect(countSolutions(emptyGrid(), limit)).toBe(limit);
      expect(findSolutions(emptyGrid(), limit)).toHaveLength(limit);
    }
    expect(hasUniqueSolution(emptyGrid())).toBe(false);
  });

  it("counts a full valid grid once and conflicting givens as zero", () => {
    expect(countSolutions(easySolution)).toBe(1);
    const grid = parseGrid(SAMPLE_EASY.puzzle);
    grid[1] = 5; // r1c1 is already 5
    expect(countSolutions(grid)).toBe(0);
    expect(findSolutions(grid)).toEqual([]);
    expect(hasUniqueSolution(grid)).toBe(false);
  });

  it("rejects a limit that is not a positive integer", () => {
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(() => countSolutions(emptyGrid(), limit)).toThrow(RangeError);
      expect(() => findSolutions(emptyGrid(), limit)).toThrow(RangeError);
    }
  });

  it("counts to 2 on the empty grid and on 17-clue puzzles in under 20 ms each (best of 5)", () => {
    // Warm the JIT first so the timing measures the search, not V8's interpreter.
    for (let seed = 0; seed < 20; seed++) countSolutions(parseGrid(SEVENTEEN_CLUE[seed % 2]!.puzzle));
    const cases = [{ name: "empty grid", puzzle: ".".repeat(81) }, ...SEVENTEEN_CLUE];
    for (const { name, puzzle } of cases) {
      // The minimum of several runs discards scheduler noise on busy CI machines.
      let best = Infinity;
      for (let run = 0; run < 5; run++) {
        const grid = parseGrid(puzzle);
        const start = performance.now();
        countSolutions(grid, 2);
        best = Math.min(best, performance.now() - start);
      }
      expect(best, `${name} best of 5 took ${best.toFixed(2)} ms`).toBeLessThan(20);
    }
  });
});

describe("countSolutions: properties", () => {
  /** A random full grid (from a seed) with a random set of cells blanked. */
  const blankedGrid = fc.tuple(fc.integer(), blanks).map(([seed, cells]) => {
    const full = solve(emptyGrid(), createRng(seed))!;
    const grid: CellValue[] = full.slice();
    for (const cell of cells) grid[cell] = 0;
    return { full, grid };
  });

  it("finds only distinct valid solutions that agree with the givens, the original among them when complete", () => {
    fc.assert(
      fc.property(blankedGrid, fc.integer({ min: 1, max: 4 }), ({ full, grid }, limit) => {
        const found = findSolutions(grid, limit);
        expect(found.length).toBeGreaterThanOrEqual(1);
        expect(found.length).toBeLessThanOrEqual(limit);
        for (const solution of found) {
          expect(isSolved(solution)).toBe(true);
          expect(respectsGivens(solution, grid)).toBe(true);
        }
        const keys = found.map(serializeGrid);
        expect(new Set(keys).size).toBe(found.length);
        // Fewer than the limit means the search was exhaustive, so the source grid is one.
        if (found.length < limit) expect(keys).toContain(serializeGrid(full));
        expect(countSolutions(grid, limit)).toBe(found.length);
      }),
      { numRuns: 200 },
    );
  });

  it("is min(true count, limit) for every limit, and never mutates its input", () => {
    fc.assert(
      fc.property(blankedGrid, ({ grid }) => {
        const frozen = Object.freeze(grid.slice());
        const total = countSolutions(frozen, 20);
        for (let limit = 1; limit <= 5; limit++) expect(countSolutions(frozen, limit)).toBe(Math.min(total, limit));
        expect(hasUniqueSolution(frozen)).toBe(total === 1);
        expect(frozen).toEqual(grid);
      }),
      { numRuns: 100 },
    );
  });
});
