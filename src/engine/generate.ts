// Generator (docs/ARCHITECTURE.md): stage 1 a random full grid, stage 2 symmetric clue removal
// while the puzzle stays unique, stage 3 grading into a requested level band (generate below).

import { grade, type Graded } from "./grade";
import { CELL_COUNT, emptyGrid, type CellValue } from "./grid";
import { createRng, type Rng } from "./random";
import { hasUniqueSolution, solve } from "./solver";
import { LEVELS, techniqueInfo, type Level } from "./step";

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

export interface GenerateOptions {
  level: Level;
  seed: number | string;
  /** Candidate puzzles to try before giving up; defaults to DEFAULT_MAX_ATTEMPTS[level]. */
  maxAttempts?: number;
}

export interface LeveledPuzzle extends GeneratedPuzzle {
  level: Level;
  score: number;
  /** 1-based count of candidate puzzles tried, including the accepted one. */
  attempts: number;
}

/**
 * Attempt budgets per level, several times the worst case measured over seeds 0..39 (attempts:
 * easy 1, medium 6, hard 143, expert 9, master 8). Hard needs by far the most; see generate.
 */
export const DEFAULT_MAX_ATTEMPTS: Readonly<Record<Level, number>> = {
  easy: 10,
  medium: 50,
  hard: 500,
  expert: 100,
  master: 100,
};

const rank = (level: Level | null): number => (level === null ? LEVELS.length : LEVELS.indexOf(level));

/**
 * Stage 2 steered by the grader: like removeCluesSymmetric, but a pair only goes if the puzzle
 * also still grades at or below `cap`. The result is unique and never harder than `cap`.
 */
function removeCluesCapped(solution: readonly CellValue[], cap: Level, rng: Rng): { puzzle: CellValue[]; graded: Graded } {
  const puzzle = solution.slice();
  // A full grid grades as easy with score 0.
  let graded = grade(puzzle) as Graded;
  const reps = rng.shuffle(Array.from({ length: (CELL_COUNT + 1) / 2 }, (_, i) => i));
  for (const cell of reps) {
    const mate = symmetricCell(cell);
    const a = puzzle[cell]!;
    const b = puzzle[mate]!;
    puzzle[cell] = 0;
    puzzle[mate] = 0;
    const next = hasUniqueSolution(puzzle) ? grade(puzzle) : null;
    // Only null ranks above master, so a capped grade is always a Graded.
    if (next && rank(next.level) <= rank(cap)) graded = next as Graded;
    else {
      puzzle[cell] = a;
      puzzle[mate] = b;
    }
  }
  return { puzzle, graded };
}

/**
 * Moves climb tries per attempt. Most attempts never get a target-tier step into the path and
 * are cheaper to abandon than to push; once one is there the attempt is worth more moves.
 */
const CLIMB_BUDGET = 60;
const CLIMB_BUDGET_ON_TARGET = 100;

/**
 * How close a graded puzzle is to grading exactly `target`, compared lexicographically (higher is
 * closer): does the path use a target-tier step at all, how few steps above the target it needs,
 * then its score. A puzzle that scores [1, 0, s] grades exactly at the target.
 */
function fitness(graded: Graded, target: Level): [number, number, number] {
  let hasTarget = 0;
  let above = 0;
  for (const step of graded.steps) {
    const tier = rank(techniqueInfo(step.technique).level);
    if (tier === rank(target)) hasTarget = 1;
    else if (tier > rank(target)) above++;
  }
  return [hasTarget, -above, hasTarget ? 0 : graded.score];
}

/**
 * Empty cells the first above-target step works on. Giving one of them back as a clue is the
 * likeliest way to make that step unnecessary.
 */
function aboveTargetHoles(graded: Graded, puzzle: readonly CellValue[], target: Level): number[] {
  const step = graded.steps.find((s) => rank(techniqueInfo(s.technique).level) > rank(target));
  if (!step) return [];
  const cells = [...step.cells, ...step.eliminations.map((e) => e.cell), ...step.placements.map((p) => p.cell)];
  return [...new Set(cells)].filter((cell) => puzzle[cell] === 0);
}

function atLeast(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
}

/**
 * Steers a puzzle that missed the target by local search: either remove one more clue, or swap
 * one (give back a solution digit somewhere, remove a different clue). Moves break the symmetry
 * on purpose, since the symmetric search is exhausted by now. A move is kept if the puzzle stays
 * unique and gradable and its fitness does not drop. The fitness admits detours above the
 * target only once a target-tier step is in the path, which is what makes Hard reachable: its
 * subsets show up almost only in puzzles that also need Expert steps, and plain removal under a
 * Hard cap skips past them.
 */
function climb(
  puzzle: CellValue[],
  solution: readonly CellValue[],
  current: Graded,
  target: Level,
  rng: Rng,
): Graded {
  let graded = current;
  let fit = fitness(graded, target);
  for (let move = 0; graded.level !== target; move++) {
    if (move >= (fit[0] === 1 ? CLIMB_BUDGET_ON_TARGET : CLIMB_BUDGET)) break;
    const clues: number[] = [];
    const holes: number[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) (puzzle[cell] === 0 ? holes : clues).push(cell);
    const targeted = fit[1] < 0 && rng.int(2) === 0 ? aboveTargetHoles(graded, puzzle, target) : [];
    let removed: number | null = null;
    let added: number | null = null;
    if (targeted.length > 0) {
      added = targeted[rng.int(targeted.length)]!;
    } else {
      removed = clues[rng.int(clues.length)]!;
      if (rng.int(2) === 0 && holes.length > 0) added = holes[rng.int(holes.length)]!;
    }
    const value = removed === null ? 0 : puzzle[removed]!;
    if (removed !== null) puzzle[removed] = 0;
    if (added !== null) puzzle[added] = solution[added]!;
    // Giving a clue back cannot break uniqueness, so pure additions skip the check.
    const next = removed === null || hasUniqueSolution(puzzle) ? grade(puzzle) : null;
    const nextFit = next?.level != null ? fitness(next, target) : null;
    if (next?.level != null && nextFit && atLeast(nextFit, fit)) {
      graded = next;
      fit = nextFit;
    } else {
      if (removed !== null) puzzle[removed] = value;
      if (added !== null) puzzle[added] = 0;
    }
  }
  return graded;
}

/**
 * Stage 3: a unique puzzle whose grade is exactly `level`, deterministic for a seed.
 *
 * Each attempt draws a fresh symmetric minimal puzzle (stages 1 and 2). Over 1000 seeds those
 * grade Easy 66%, Medium 10%, Hard 0%, Expert 8%, Master 10%, and 6% are beyond Master; hard-tier
 * subsets almost only appear in puzzles that also need Expert steps. An attempt that misses is
 * steered by climb (asymmetric removals and swaps, scored by fitness) instead of being thrown
 * away; an ungradable start is first redone with removal capped at the target level. Steering
 * brings Medium, Expert and Master to a few attempts and makes Hard reachable at all, though it
 * stays the slowest level by far, which is why the bank pre-generates it.
 *
 * Measured median time per generate call (tsx on Node 22, dev container, seeds 0..39):
 *   easy    ~2 ms     (median 1 attempt)
 *   medium  ~13 ms    (median 1 attempt)
 *   hard    ~440 ms   (median 27 attempts, worst seen 2.6 s)
 *   expert  ~40 ms    (median 3 attempts)
 *   master  ~20 ms    (median 2 attempts)
 *
 * Throws if no attempt within `maxAttempts` reaches the level.
 */
export function generate({
  level,
  seed,
  maxAttempts = DEFAULT_MAX_ATTEMPTS[level],
}: GenerateOptions): LeveledPuzzle {
  const rng = createRng(seed);
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const solution = randomFullGrid(rng);
    let puzzle = removeCluesSymmetric(solution, rng);
    const raw = grade(puzzle);
    let graded: Graded;
    if (raw.level === null) ({ puzzle, graded } = removeCluesCapped(solution, level, rng));
    else graded = raw;
    if (graded.level !== level) graded = climb(puzzle, solution, graded, level, rng);
    if (graded.level === level) {
      return { puzzle, solution, seed, level, score: graded.score, attempts };
    }
  }
  throw new Error(`No ${level} puzzle for seed ${String(seed)} within ${maxAttempts} attempts`);
}
