import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromGrid, type CandidateState } from "../candidates";
import { UNITS, digitBit, emptyGrid, maskDigits, parseGrid, popcount, type CellValue, type Digit } from "../grid";
import { createRng } from "../random";
import { SAMPLE_EASY } from "../samples";
import { solve } from "../solver";
import { LEVELS, TECHNIQUES, applyStep, cellName, type Level, type Step, type TechniqueId } from "../step";
import { nextStep, solveLogically } from "./driver";
import { createRegistry, defaultRegistry, type Finder } from "./registry";

/** Always fires: removes the lowest candidate of the first cell that has one, tagged with id. */
const alwaysStub =
  (id: TechniqueId): Finder =>
  (state) => {
    const cell = state.candidates.findIndex((m) => m !== 0);
    if (cell < 0) return null;
    const digit = maskDigits(state.candidates[cell]!)[0]!;
    return { technique: id, placements: [], eliminations: [{ cell, digit }], cells: [cell], digits: [digit], explanation: id };
  };

const never: Finder = () => null;

// Minimal real singles so the driver can be exercised end to end before M2-02 lands.
const nakedSingle: Finder = (state) => {
  for (let cell = 0; cell < 81; cell++) {
    const mask = state.candidates[cell]!;
    if (state.values[cell] === 0 && popcount(mask) === 1) {
      const digit = maskDigits(mask)[0]!;
      return {
        technique: "naked-single",
        placements: [{ cell, digit }],
        eliminations: [],
        cells: [cell],
        digits: [digit],
        explanation: `${cellName(cell)} can only hold ${digit}`,
      };
    }
  }
  return null;
};

const hiddenSingle: Finder = (state) => {
  for (const [u, unit] of UNITS.entries()) {
    for (let d = 1; d <= 9; d++) {
      const digit = d as Digit;
      const spots = unit.filter((c) => (state.candidates[c]! & digitBit(digit)) !== 0);
      if (spots.length === 1) {
        const cell = spots[0]!;
        return {
          technique: "hidden-single",
          placements: [{ cell, digit }],
          eliminations: [],
          cells: [cell],
          digits: [digit],
          units: [u],
          explanation: `Only ${cellName(cell)} in unit ${u} can hold ${digit}`,
        };
      }
    }
  }
  return null;
};

function singlesRegistry() {
  const r = createRegistry();
  r.register("hidden-single", hiddenSingle);
  r.register("naked-single", nakedSingle);
  return r;
}

const rank = (id: TechniqueId) => {
  const t = TECHNIQUES.find((x) => x.id === id)!;
  return [LEVELS.indexOf(t.level), t.weight, TECHNIQUES.indexOf(t)] as const;
};
const cheaper = (a: TechniqueId, b: TechniqueId) => {
  const [la, wa, ia] = rank(a);
  const [lb, wb, ib] = rank(b);
  return la - lb || wa - wb || ia - ib;
};

/** A random solution grid with `holes` cells cleared, both drawn from the seeded PRNG. */
function randomPuzzle(seed: number, holes: number): { puzzle: CellValue[]; solution: CellValue[] } {
  const rng = createRng(seed);
  const solution = solve(emptyGrid(), rng)!;
  const puzzle = [...solution];
  for (const cell of rng.shuffle([...Array(81).keys()]).slice(0, holes)) puzzle[cell] = 0;
  return { puzzle, solution };
}

const ids = TECHNIQUES.map((t) => t.id);

describe("registry", () => {
  it("orders by tier then weight regardless of registration order", () => {
    const r = createRegistry();
    // Within expert the table lists swordfish (45) before xy-wing (40); weight must win.
    for (const id of ["unique-rectangle", "swordfish", "xy-wing", "pointing", "naked-single", "claiming"] as const) {
      r.register(id, never);
    }
    expect(r.list().map((t) => t.id)).toEqual(["naked-single", "pointing", "claiming", "xy-wing", "swordfish", "unique-rectangle"]);
    expect(r.list("medium").map((t) => t.id)).toEqual(["naked-single", "pointing", "claiming"]);
    expect(r.list("easy").map((t) => t.id)).toEqual(["naked-single"]);
  });

  it("takes level and weight from TECHNIQUES", () => {
    const r = createRegistry();
    r.register("x-wing", never);
    expect(r.list()[0]).toMatchObject({ id: "x-wing", level: "expert", weight: 30, name: "X-Wing" });
  });

  it("rejects duplicate registration", () => {
    const r = createRegistry();
    r.register("naked-pair", never);
    expect(() => r.register("naked-pair", never)).toThrow(/already registered/);
  });

  it("keeps separate registries isolated from each other and from the default", () => {
    const a = createRegistry();
    a.register("w-wing", never);
    expect(createRegistry().has("w-wing")).toBe(false);
    expect(defaultRegistry.list().map((t) => t.id)).not.toContain("w-wing");
  });

  it("property: list is sorted by tier, weight, table order and respects maxLevel", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(ids), fc.constantFrom(...LEVELS), (chosen, maxLevel) => {
        const r = createRegistry();
        for (const id of chosen) r.register(id, never);
        const listed = r.list(maxLevel).map((t) => t.id);
        const expected = chosen
          .filter((id) => LEVELS.indexOf(TECHNIQUES.find((t) => t.id === id)!.level) <= LEVELS.indexOf(maxLevel))
          .sort(cheaper);
        expect(listed).toEqual(expected);
      }),
    );
  });
});

describe("nextStep", () => {
  const state = fromGrid(parseGrid(SAMPLE_EASY.puzzle));

  it("returns null with an empty registry", () => {
    expect(nextStep(state, "master", createRegistry())).toBeNull();
  });

  it("returns the cheapest applicable technique, skipping ones that find nothing", () => {
    const r = createRegistry();
    r.register("x-wing", alwaysStub("x-wing"));
    r.register("hidden-pair", alwaysStub("hidden-pair"));
    r.register("naked-single", never);
    r.register("naked-pair", never);
    expect(nextStep(state, "master", r)?.technique).toBe("hidden-pair");
  });

  it("respects maxLevel", () => {
    const r = createRegistry();
    r.register("x-wing", alwaysStub("x-wing"));
    expect(nextStep(state, "hard", r)).toBeNull();
    expect(nextStep(state, "expert", r)?.technique).toBe("x-wing");
  });

  it("orders by weight within a tier, not by table position", () => {
    const r = createRegistry();
    r.register("swordfish", alwaysStub("swordfish"));
    r.register("xy-wing", alwaysStub("xy-wing"));
    expect(nextStep(state, "expert", r)?.technique).toBe("xy-wing");
  });

  it("throws on a mislabeled step", () => {
    const r = createRegistry();
    r.register("pointing", alwaysStub("claiming"));
    expect(() => nextStep(state, "medium", r)).toThrow(/returned a claiming step/);
  });

  it("throws on a step that changes nothing", () => {
    const filled = state.values.findIndex((v) => v !== 0);
    const noop: Step = { technique: "pointing", placements: [], eliminations: [{ cell: filled, digit: 1 }], cells: [], digits: [], explanation: "noop" };
    const r = createRegistry();
    r.register("pointing", () => noop);
    expect(() => nextStep(state, "medium", r)).toThrow(/no progress/);
  });

  it("does not mutate the input state", () => {
    const before = JSON.stringify(state);
    nextStep(state, "master", singlesRegistry());
    expect(JSON.stringify(state)).toBe(before);
  });

  it("property: returns the cheapest registered technique within maxLevel", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(ids),
        fc.shuffledSubarray(ids),
        fc.constantFrom(...LEVELS),
        (firing, silent, maxLevel) => {
          const r = createRegistry();
          for (const id of firing) r.register(id, alwaysStub(id));
          for (const id of silent) if (!r.has(id)) r.register(id, never);
          const allowed = firing.filter((id) => LEVELS.indexOf(TECHNIQUES.find((t) => t.id === id)!.level) <= LEVELS.indexOf(maxLevel));
          const expected = allowed.sort(cheaper)[0] ?? null;
          expect(nextStep(state, maxLevel, r)?.technique ?? null).toBe(expected);
        },
      ),
    );
  });
});

describe("solveLogically", () => {
  it("solves the sample easy puzzle with singles and matches its solution", () => {
    const result = solveLogically(fromGrid(parseGrid(SAMPLE_EASY.puzzle)), "easy", singlesRegistry());
    expect(result.solved).toBe(true);
    expect(result.stuckState).toBeNull();
    const end = result.steps.reduce(applyStep, fromGrid(parseGrid(SAMPLE_EASY.puzzle)));
    expect(end.values.join("")).toBe(SAMPLE_EASY.solution);
    // The sample falls to naked singles alone; the cheaper technique always wins when both apply.
    expect(result.steps.every((s) => s.technique === "naked-single")).toBe(true);
  });

  it("reports stuck with the state it stopped at", () => {
    const start = fromGrid(parseGrid(SAMPLE_EASY.puzzle));
    const result = solveLogically(start, "easy", createRegistry());
    expect(result).toEqual({ steps: [], solved: false, stuckState: start });
  });

  it("returns solved with no steps for a complete grid", () => {
    const result = solveLogically(fromGrid(parseGrid(SAMPLE_EASY.solution)), "easy", singlesRegistry());
    expect(result).toEqual({ steps: [], solved: true, stuckState: null });
  });

  it("does not apply techniques above maxLevel", () => {
    const r = createRegistry();
    r.register("naked-single", nakedSingle);
    r.register("x-wing", alwaysStub("x-wing"));
    const { steps } = solveLogically(fromGrid(parseGrid(SAMPLE_EASY.puzzle)), "hard", r);
    expect(steps.every((s) => s.technique === "naked-single")).toBe(true);
  });

  it("property: steps replay to the end state, placements match the solution, stuck states are stuck", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.integer({ min: 0, max: 64 }), (seed, holes) => {
        const { puzzle, solution } = randomPuzzle(seed, holes);
        const start = fromGrid(puzzle);
        const before = JSON.stringify(start);
        const r = singlesRegistry();
        const result = solveLogically(start, "easy", r);
        expect(JSON.stringify(start)).toBe(before);

        let s: CandidateState = start;
        for (const step of result.steps) {
          for (const { cell, digit } of step.placements) expect(digit).toBe(solution[cell]);
          for (const { cell, digit } of step.eliminations) expect(digit).not.toBe(solution[cell]);
          s = applyStep(s, step);
        }
        if (result.solved) {
          expect(result.stuckState).toBeNull();
          expect(s.values).toEqual(solution);
        } else {
          expect(result.stuckState).toEqual(s);
          expect(nextStep(s, "easy", r)).toBeNull();
        }
      }),
      { numRuns: 50 },
    );
  });

  it("property: an always-firing stub above maxLevel never appears in the path", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.constantFrom<Level>("easy", "medium", "hard"), (seed, maxLevel) => {
        const r = singlesRegistry();
        r.register("x-chain", alwaysStub("x-chain"));
        const { steps } = solveLogically(fromGrid(randomPuzzle(seed, 55).puzzle), maxLevel, r);
        expect(steps.some((s) => s.technique === "x-chain")).toBe(false);
      }),
      { numRuns: 30 },
    );
  });
});
