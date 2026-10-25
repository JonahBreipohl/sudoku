import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CELL_COUNT, serializeGrid } from "./grid";
import {
  DEFAULT_MAX_ATTEMPTS,
  generate,
  generateUnique,
  randomFullGrid,
  removeCluesSymmetric,
  symmetricCell,
  type LeveledPuzzle,
} from "./generate";
import { grade } from "./grade";
import type { Level } from "./step";
import { createRng } from "./random";
import { hasUniqueSolution, solve } from "./solver";
import { isSolved, respectsGivens } from "./validate";

function expectSymmetric(puzzle: readonly number[]): void {
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    expect(puzzle[cell] === 0, `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`).toBe(
      puzzle[symmetricCell(cell)] === 0,
    );
  }
}

describe("symmetricCell", () => {
  it("rotates 180 degrees and is an involution", () => {
    expect(symmetricCell(0)).toBe(80);
    expect(symmetricCell(40)).toBe(40);
    expect(symmetricCell(9 * 2 + 3)).toBe(9 * 6 + 5);
    for (let cell = 0; cell < CELL_COUNT; cell++) expect(symmetricCell(symmetricCell(cell))).toBe(cell);
  });
});

describe("randomFullGrid", () => {
  it("returns a valid full grid that differs between seeds", () => {
    const a = randomFullGrid(createRng(1));
    const b = randomFullGrid(createRng(2));
    expect(isSolved(a)).toBe(true);
    expect(isSolved(b)).toBe(true);
    expect(serializeGrid(a)).not.toBe(serializeGrid(b));
  });
});

describe("generateUnique", () => {
  it("50 seeds give unique, symmetric puzzles whose solution matches", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const { puzzle, solution, seed: echoed } = generateUnique(seed);
      expect(echoed).toBe(seed);
      expect(isSolved(solution)).toBe(true);
      expect(respectsGivens(solution, puzzle)).toBe(true);
      expect(hasUniqueSolution(puzzle)).toBe(true);
      expect(serializeGrid(solve(puzzle)!)).toBe(serializeGrid(solution));
      expectSymmetric(puzzle);
      // Typical generated puzzles land in the low 20s to low 30s of clues.
      const clues = puzzle.filter((v) => v !== 0).length;
      expect(clues).toBeGreaterThanOrEqual(17);
      expect(clues).toBeLessThanOrEqual(40);
      seen.add(serializeGrid(puzzle));
    }
    expect(seen.size).toBe(50);
  });

  it("is deterministic for a seed, including string seeds", () => {
    expect(generateUnique(1234)).toEqual(generateUnique(1234));
    expect(generateUnique("2026-10-24")).toEqual(generateUnique("2026-10-24"));
    expect(serializeGrid(generateUnique(1).puzzle)).not.toBe(serializeGrid(generateUnique(2).puzzle));
  });

  it("property: any seed gives a unique symmetric puzzle consistent with its solution", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string()), (seed) => {
        const { puzzle, solution } = generateUnique(seed);
        expect(isSolved(solution)).toBe(true);
        expect(respectsGivens(solution, puzzle)).toBe(true);
        expect(hasUniqueSolution(puzzle)).toBe(true);
        expectSymmetric(puzzle);
      }),
      { numRuns: 25 },
    );
  });

  it("property: removal is pair-minimal (no remaining symmetric pair can go)", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { puzzle } = generateUnique(seed);
        for (let cell = 0; cell <= 40; cell++) {
          if (puzzle[cell] === 0) continue;
          const trial = puzzle.slice();
          trial[cell] = 0;
          trial[symmetricCell(cell)] = 0;
          expect(hasUniqueSolution(trial)).toBe(false);
        }
      }),
      { numRuns: 10 },
    );
  });

  it("removeCluesSymmetric does not mutate its input", () => {
    const solution = randomFullGrid(createRng("full"));
    const copy = solution.slice();
    removeCluesSymmetric(solution, createRng("remove"));
    expect(solution).toEqual(copy);
  });

  it("median generation time is under 50 ms", () => {
    // Timing, not correctness: a loaded CI box could push this, but the budget is ~10x headroom.
    const times: number[] = [];
    for (let seed = 0; seed < 21; seed++) {
      const start = performance.now();
      generateUnique(`timing-${seed}`);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[10]!).toBeLessThan(50);
  });
});

function expectValidAt(result: LeveledPuzzle, level: Level): void {
  expect(result.level).toBe(level);
  expect(result.attempts).toBeGreaterThanOrEqual(1);
  expect(result.attempts).toBeLessThanOrEqual(DEFAULT_MAX_ATTEMPTS[level]);
  expect(isSolved(result.solution)).toBe(true);
  expect(respectsGivens(result.solution, result.puzzle)).toBe(true);
  expect(hasUniqueSolution(result.puzzle)).toBe(true);
  // The reported level and score are the grader's, not the generator's own bookkeeping.
  const graded = grade(result.puzzle);
  expect(graded.level).toBe(level);
  if (graded.level !== null) expect(result.score).toBe(graded.score);
}

describe("generate", () => {
  // Easy and Medium take milliseconds per puzzle; Hard is the slow level (median ~0.4 s, see
  // generate's doc comment), so its run gets an explicit, generous timeout.
  function reachesForTenSeeds(level: Level): void {
    for (let seed = 0; seed < 10; seed++) {
      const result = generate({ level, seed });
      expect(result.seed).toBe(seed);
      expectValidAt(result, level);
    }
  }

  it.each(["easy", "medium"] as const)("reaches %s for 10 seeds within the default budget", (level) => {
    reachesForTenSeeds(level);
  });

  it("reaches hard for 10 seeds within the default budget (slow, several seconds)", () => {
    reachesForTenSeeds("hard");
  }, 60_000);

  it.each(["expert", "master"] as const)(
    "reaches %s for 3 seeds within the default budget",
    (level) => {
      for (const seed of [0, 1, "2026-10-25"]) expectValidAt(generate({ level, seed }), level);
    },
    20_000,
  );

  it("is deterministic for a seed", () => {
    expect(generate({ level: "expert", seed: 7 })).toEqual(generate({ level: "expert", seed: 7 }));
    expect(generate({ level: "medium", seed: "day" })).toEqual(generate({ level: "medium", seed: "day" }));
    expect(serializeGrid(generate({ level: "easy", seed: 1 }).puzzle)).not.toBe(
      serializeGrid(generate({ level: "easy", seed: 2 }).puzzle),
    );
  });

  it("counts attempts and throws when the budget runs out", () => {
    // Find a seed whose first attempt misses, then check the budget is enforced against it.
    let seed = 0;
    while (generate({ level: "master", seed }).attempts < 2) seed++;
    const { attempts } = generate({ level: "master", seed });
    expect(generate({ level: "master", seed, maxAttempts: attempts }).attempts).toBe(attempts);
    expect(() => generate({ level: "master", seed, maxAttempts: attempts - 1 })).toThrow(/master/);
  }, 20_000);

  it("property: any seed gives a unique puzzle graded at the requested level", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string()), fc.constantFrom<Level>("easy", "medium"), (seed, level) => {
        expectValidAt(generate({ level, seed }), level);
      }),
      { numRuns: 15 },
    );
  }, 20_000);
});
