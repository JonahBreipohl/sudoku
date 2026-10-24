// Generator stages 1 and 2 (docs/ARCHITECTURE.md): a random full grid, then symmetric clue
// removal while the puzzle stays unique. Grading against a level band (stage 3) builds on this.

import { CELL_COUNT, emptyGrid, type CellValue } from "./grid";
import { createRng, type Rng } from "./random";
import { hasUniqueSolution, solve } from "./solver";

export interface GeneratedPuzzle {
  puzzle: CellValue[];
  solution: CellValue[];
  seed: number | string;
}

/** The cell a clue is paired with under 180-degree rotation; the centre (r5c5) pairs with itself. */
export const symmetricCell = (cell: number): number => CELL_COUNT - 1 - cell;

/** Stage 1: a uniformly shuffled search over the empty grid always reaches a full grid. */
export function randomFullGrid(rng: Rng): CellValue[] {
  const grid = solve(emptyGrid(), rng);
  // The empty grid is always solvable, so null here means the solver itself is broken.
  if (!grid) throw new Error("Solver failed on the empty grid");
  return grid;
}

/**
 * Stage 2: visits each symmetric pair once in rng order and removes it when the puzzle keeps
 * exactly one solution. Single passes suffice: a pair that could not go earlier cannot go
 * later either, because removing more clues only adds solutions.
 */
export function removeCluesSymmetric(solution: readonly CellValue[], rng: Rng): CellValue[] {
  const puzzle = solution.slice();
  // Cells 0..40 are one representative per pair (40 is the centre).
  const reps = rng.shuffle(Array.from({ length: (CELL_COUNT + 1) / 2 }, (_, i) => i));
  for (const cell of reps) {
    const mate = symmetricCell(cell);
    const a = puzzle[cell]!;
    const b = puzzle[mate]!;
    puzzle[cell] = 0;
    puzzle[mate] = 0;
    if (!hasUniqueSolution(puzzle)) {
      puzzle[cell] = a;
      puzzle[mate] = b;
    }
  }
  return puzzle;
}

/** A unique, 180-degree symmetric puzzle; the same seed always yields the same puzzle. */
export function generateUnique(seed: number | string): GeneratedPuzzle {
  const rng = createRng(seed);
  const solution = randomFullGrid(rng);
  const puzzle = removeCluesSymmetric(solution, rng);
  return { puzzle, solution, seed };
}
