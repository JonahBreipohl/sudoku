// Timing budget for grading (docs/PLAN.md: the generator grades many candidates per puzzle, so
// grading one Master puzzle must stay well under 200 ms in Node). Measured worst cases are
// around 20 ms, so the assertion keeps roughly 10x headroom for slow or loaded CI machines.

import { describe, expect, it } from "vitest";
import { generateUnique } from "./generate";
import { grade } from "./grade";
import { parseGrid, type Grid } from "./grid";

const BUDGET_MS = 200;
const RUNS = 5;

// The two Master references from grade.test.ts, plus the three slowest Master puzzles found by
// timing grade(generateUnique(seed)) for seeds 1..600.
const MASTER: { name: string; puzzle: Grid }[] = [
  { name: "reference seed 19 (unique-rectangle)", puzzle: parseGrid("3.5..68...8...5....12.4.3.....2......23...76......4.....1.3.59....4...7...91..2.8") },
  { name: "reference seed 21 (xy-chain)", puzzle: parseGrid("2..6...7...9...86.....25..95.1.4..2...........2..6.7.33..15.....68...5...9...3..6") },
  ...[140, 153, 40].map((seed) => ({ name: `generated seed ${seed}`, puzzle: generateUnique(seed).puzzle })),
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("grade performance", () => {
  it.each(MASTER.map((m) => [m.name, m.puzzle] as const))(
    "grades %s at Master in under 200 ms",
    (_name, puzzle) => {
      // The first call pays for JIT warm-up, which the generator only pays once per worker.
      expect(grade(puzzle).level).toBe("master");
      const times: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const start = performance.now();
        grade(puzzle);
        times.push(performance.now() - start);
      }
      // Median rather than max, so one GC pause or scheduler hiccup under parallel load
      // cannot fail the budget.
      expect(median(times)).toBeLessThan(BUDGET_MS);
    },
    // Six grades at well under a second each; explicit so a loaded machine cannot hit the 5 s default.
    20_000,
  );
});
