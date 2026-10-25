// Engine-wide soundness: every registered technique, run over many unique puzzles, never
// eliminates a solution digit and never places a wrong one. The per-technique suites test each
// finder on crafted grids; this one checks them all together on the states real solves reach.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eliminate, fromGrid, place, type CandidateState } from "../candidates";
import { generateUnique } from "../generate";
import { DIGITS, digitBit, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { TECHNIQUES, applyStep, type Step, type TechniqueId } from "../step";
import { nextStep } from "./driver";
import { defaultRegistry } from "./registry";
import "./techniques";

const PUZZLE_COUNT = 200;

/** Checks a step against the known solution; returns nothing, fails the test on any violation. */
function expectSound(state: CandidateState, step: Step, id: TechniqueId, solution: readonly CellValue[]): void {
  expect(step.technique).toBe(id);
  for (const { cell, digit } of step.placements) {
    expect(digit, `${id} placed ${digit} in cell ${cell}: ${step.explanation}`).toBe(solution[cell]);
  }
  for (const { cell, digit } of step.eliminations) {
    expect(digit, `${id} eliminated the solution digit in cell ${cell}: ${step.explanation}`).not.toBe(solution[cell]);
  }
  // A useless step would make the driver loop; nextStep also asserts this, but only for winners.
  const progress =
    step.placements.some(({ cell }) => state.values[cell] === 0) ||
    step.eliminations.some(({ cell, digit }) => ((state.candidates[cell] ?? 0) & digitBit(digit)) !== 0);
  expect(progress, `${id} made no progress: ${step.explanation}`).toBe(true);
}

const unsolved = (state: CandidateState): boolean => state.values.some((v) => v === 0);
const firstEmpty = (state: CandidateState): number => state.values.findIndex((v) => v === 0);

/**
 * Runs finders at every state of a solve and returns which techniques fired. Singles run at
 * every state; the rest run only once singles are exhausted, which is where the driver would
 * reach them anyway and keeps the suite fast (running all of them everywhere costs ~10x more).
 * When the driver is stuck the walk places the next solution digit, so finders also see states
 * past the point Master logic reaches.
 */
function walk(start: CandidateState, solution: readonly CellValue[], fired: Map<TechniqueId, number>): void {
  const singles = defaultRegistry.list("easy");
  const all = defaultRegistry.list("master");
  let state = start;
  while (unsolved(state)) {
    let singleFound = false;
    for (const t of singles) {
      const step = t.find(state);
      if (!step) continue;
      singleFound = true;
      expectSound(state, step, t.id, solution);
      fired.set(t.id, (fired.get(t.id) ?? 0) + 1);
    }
    if (!singleFound) {
      for (const t of all) {
        if (t.level === "easy") continue;
        const step = t.find(state);
        if (!step) continue;
        expectSound(state, step, t.id, solution);
        fired.set(t.id, (fired.get(t.id) ?? 0) + 1);
      }
    }
    const step = nextStep(state, "master");
    if (step) {
      state = applyStep(state, step);
    } else {
      const cell = firstEmpty(state);
      state = place(state, cell, solution[cell] as Digit);
    }
  }
}

describe("every registered technique over generated puzzles", () => {
  it("registers every technique in the table", () => {
    for (const { id } of TECHNIQUES) expect(defaultRegistry.has(id), id).toBe(true);
  });

  it(
    `never eliminates a solution digit or places a wrong digit, over ${PUZZLE_COUNT} unique puzzles`,
    () => {
      const fired = new Map<TechniqueId, number>();
      for (let seed = 1; seed <= PUZZLE_COUNT; seed++) {
        const { puzzle, solution } = generateUnique(`invariants-${seed}`);
        walk(fromGrid(puzzle), solution, fired);
      }
      // Guards against a vacuous pass: each technique must actually have been exercised.
      for (const { id } of TECHNIQUES) expect(fired.get(id) ?? 0, `${id} never fired`).toBeGreaterThan(0);
    },
    // About 3 s alone; generous so parallel load cannot time it out.
    60_000,
  );

  it(
    "property: stays sound on states with extra non-solution candidates removed",
    () => {
      // Removing only non-solution candidates keeps the state consistent with the unique
      // solution, so every technique's reasoning (uniqueness included) must still hold. These
      // pencil-mark states differ from anything the driver produces on its own.
      const fired = new Map<TechniqueId, number>();
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.integer({ min: 0, max: 150 }), (seed, removals) => {
          const { puzzle, solution } = generateUnique(seed);
          const rng = createRng(`thin-${seed}`);
          let state = fromGrid(puzzle);
          for (let i = 0; i < removals; i++) {
            const cell = rng.int(81);
            const digit = DIGITS[rng.int(9)]!;
            if (digit !== solution[cell] && ((state.candidates[cell] ?? 0) & digitBit(digit)) !== 0) {
              state = eliminate(state, cell, digit);
            }
          }
          walk(state, solution, fired);
        }),
        { numRuns: 40 },
      );
      expect(fired.size).toBeGreaterThan(TECHNIQUES.length / 2);
    },
    60_000,
  );

  it("never mutates the state it is given", () => {
    const { puzzle } = generateUnique("invariants-mutation");
    let state = fromGrid(puzzle);
    while (unsolved(state)) {
      const snapshot = JSON.stringify(state);
      for (const t of defaultRegistry.list()) t.find(state);
      expect(JSON.stringify(state)).toBe(snapshot);
      const step = nextStep(state, "master");
      if (!step) break;
      state = applyStep(state, step);
    }
  });
});
