// Grader (docs/ARCHITECTURE.md, "Technique tiers"): a puzzle's level is the tier of the hardest
// technique the Master driver needs, and its score is the sum of step weights along that path.

import { fromGrid } from "./candidates";
import type { Grid } from "./grid";
import { solveLogically } from "./human/driver";
import { defaultRegistry, type TechniqueRegistry } from "./human/registry";
import { LEVELS, techniqueInfo, type Level, type Step, type Technique, type TechniqueId } from "./step";

export interface Graded {
  level: Level;
  /** Summed step weights; orders puzzles within a level. */
  score: number;
  /**
   * The technique that set the level: highest tier, then highest weight within that tier.
   * Null only for a grid with no empty cells, which grades as easy with score 0.
   */
  hardest: TechniqueId | null;
  /** The driver's solve path, replayable with applyStep from fromGrid(puzzle). */
  steps: Step[];
}

/** The Master driver got stuck: the puzzle needs guessing, has no unique solution, or is invalid. */
export interface Ungraded {
  level: null;
  /** Steps found before the driver got stuck, for diagnostics. */
  steps: Step[];
}

export type GradeResult = Graded | Ungraded;

const levelRank = (level: Level): number => LEVELS.indexOf(level);

function harder(a: Technique, b: Technique): boolean {
  return levelRank(a.level) > levelRank(b.level) || (a.level === b.level && a.weight > b.weight);
}

/** Grades a puzzle by solving it logically at Master. Does not check uniqueness itself. */
export function grade(puzzle: Grid, registry: TechniqueRegistry = defaultRegistry): GradeResult {
  const { steps, solved } = solveLogically(fromGrid(puzzle), "master", registry);
  if (!solved) return { level: null, steps };

  let hardest: Technique | null = null;
  let score = 0;
  for (const step of steps) {
    const info = techniqueInfo(step.technique);
    score += info.weight;
    if (!hardest || harder(info, hardest)) hardest = info;
  }
  return { level: hardest?.level ?? "easy", score, hardest: hardest?.id ?? null, steps };
}
