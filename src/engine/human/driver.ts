import type { CandidateState } from "../candidates";
import { digitBit } from "../grid";
import { applyStep, type Level, type Step } from "../step";
import { defaultRegistry, type TechniqueRegistry } from "./registry";
import "./techniques";

export interface LogicalSolve {
  /** Steps in the order applied; replaying them with applyStep from the input reproduces the end state. */
  steps: Step[];
  /** Every cell holds a value. */
  solved: boolean;
  /** The state where no technique at or below maxLevel applied; null when solved. */
  stuckState: CandidateState | null;
}

/**
 * A step that changes nothing would make solveLogically loop forever, and a mislabeled one
 * would corrupt grading, so both are treated as bugs in the technique rather than skipped.
 */
function assertUseful(state: CandidateState, step: Step, expected: string): void {
  if (step.technique !== expected) {
    throw new Error(`Finder for ${expected} returned a ${step.technique} step`);
  }
  const places = step.placements.some(({ cell }) => state.values[cell] === 0);
  const eliminates = step.eliminations.some(({ cell, digit }) => ((state.candidates[cell] ?? 0) & digitBit(digit)) !== 0);
  if (!places && !eliminates) throw new Error(`${expected} step makes no progress: ${step.explanation}`);
}

/** The first step from the cheapest applicable technique at or below maxLevel, or null when stuck. */
export function nextStep(
  state: CandidateState,
  maxLevel: Level,
  registry: TechniqueRegistry = defaultRegistry,
): Step | null {
  for (const technique of registry.list(maxLevel)) {
    const step = technique.find(state);
    if (step) {
      assertUseful(state, step, technique.id);
      return step;
    }
  }
  return null;
}

const isSolved = (state: CandidateState): boolean => state.values.every((v) => v !== 0);

/**
 * Applies nextStep until solved or stuck. Terminates because every step must place a value or
 * remove a candidate, and a state has finitely many of both.
 */
export function solveLogically(
  state: CandidateState,
  maxLevel: Level,
  registry: TechniqueRegistry = defaultRegistry,
): LogicalSolve {
  const steps: Step[] = [];
  let current = state;
  while (!isSolved(current)) {
    const step = nextStep(current, maxLevel, registry);
    if (!step) return { steps, solved: false, stuckState: current };
    steps.push(step);
    current = applyStep(current, step);
  }
  return { steps, solved: true, stuckState: null };
}
