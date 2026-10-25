// Shared assertions for generate.test.ts and generate.slow.test.ts. Only tests import this file.

import { expect } from "vitest";
import { DEFAULT_MAX_ATTEMPTS, type LeveledPuzzle } from "./generate";
import { grade } from "./grade";
import type { Level } from "./step";
import { hasUniqueSolution } from "./solver";
import { isSolved, respectsGivens } from "./validate";

/** A generated puzzle is unique, consistent with its solution, and graded exactly `level`. */
export function expectValidAt(result: LeveledPuzzle, level: Level): void {
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
