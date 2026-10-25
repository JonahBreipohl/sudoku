// Slow generator tests, kept out of `npm run check` (vite.config.ts excludes *.slow.test.ts) and
// run with `npm run test:slow`. Hard is the slowest level (median ~0.4 s per puzzle, worst seeds
// several seconds), so ten seeds take about ten seconds. generate.test.ts keeps a two-seed Hard
// reachability test in the check run; scripts/sweep-attempts.ts covers the wider budget sweep.

import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_ATTEMPTS, generate } from "./generate";
import { expectValidAt } from "./generate.testing";

describe("generate (slow)", () => {
  it("reaches hard for 10 seeds, each within a third of the default budget", () => {
    for (let seed = 0; seed < 10; seed++) {
      const result = generate({ level: "hard", seed });
      expect(result.seed).toBe(seed);
      expectValidAt(result, "hard");
      // The headroom bar the budget is sized to; see DEFAULT_MAX_ATTEMPTS.
      expect(result.attempts).toBeLessThanOrEqual(DEFAULT_MAX_ATTEMPTS.hard / 3);
    }
  }, 120_000);
});
