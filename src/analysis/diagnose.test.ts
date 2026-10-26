import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DIGITS, PEERS, cellName, computeCandidates, digitBit, fromGrid, parseGrid, solve, solveLogically, type Digit, type Level } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import type { GameRecord, InputMethod } from "../state/events";
import { append, type NewBoardEvent, type Tree } from "../state/tree";
import { diagnose, diagnoseRecord, inputLayout, keysAdjacent, type MistakeDiagnosis } from "./diagnose";
import { findMistakes } from "./mistakes";

type Body = NewBoardEvent extends infer E ? (E extends unknown ? Omit<E, "at" | "elapsed"> : never) : never;
/** A body plus the gap in ms since the previous event (default: a slow, deliberate 5 s). */
type Timed = Body & { gap?: number };

const place = (cell: number, digit: number, input: InputMethod = "keyboard", key?: string): Body =>
  key === undefined ? { type: "place", cell, digit, input } : { type: "place", cell, digit, input, key };

interface Puzzle {
  puzzle: string;
  solution: string;
}

function recordOf(p: Puzzle, events: Timed[], level: Level): GameRecord {
  let at = 1_000_000;
  const tree = events.reduce<Tree>(
    (t, { gap = 5000, ...body }) => {
      at += gap;
      return append(t, { ...body, at, elapsed: at } as NewBoardEvent);
    },
    { nodes: [], cursor: -1 },
  );
  return {
    version: 1,
    id: "test",
    puzzle: p.puzzle,
    solution: p.solution,
    level,
    score: 0,
    source: "import",
    createdAt: 0,
    nodes: [...tree.nodes],
    cursor: tree.cursor,
    log: [],
    status: "playing",
  };
}

const diagnosesOf = (p: Puzzle, events: Timed[], level: Level = "easy"): MistakeDiagnosis[] =>
  diagnoseRecord(recordOf(p, events, level)).diagnoses;

const only = (p: Puzzle, events: Timed[], level: Level = "easy"): MistakeDiagnosis => {
  const ds = diagnosesOf(p, events, level);
  expect(ds).toHaveLength(1);
  return ds[0]!;
};

// Sample cells used below (candidates at the start in brackets):
// r1c3 = 4 [124], r1c7 = 9 [1489], r2c7 = 3 [3478], r5c2 = 2 [25], r5c3 = 6 [2569].
const R1C3 = 2;
const R1C7 = 6;
const R2C7 = 15;
const R5C2 = 37;
const R5C3 = 38;

// An Expert puzzle from the bank (x-000065). Singles alone stall on it after 28 placements.
const EXPERT: Puzzle = {
  puzzle: "013000028000100000800000600000009050052000740060300000009200001600003000720900560",
  solution: "413657928276198435895432617148729356352816749967345182539264871681573294724981563",
};

describe("diagnose: one case per diagnosis", () => {
  it("consequence: an earlier wrong value in a peer holds the cell's solution digit", () => {
    // r5c3 wrongly takes 2, which belongs in r5c2; r5c2's 5 then follows from it.
    const ds = diagnosesOf(SAMPLE_EASY, [place(R5C3, 2), place(R5C2, 5)]);
    expect(ds).toHaveLength(2);
    const d = ds[1]!;
    expect(d.diagnosis).toEqual({ kind: "consequence", wrongCell: R5C3, wrongEventId: 0 });
    expect(d.summary).toContain("r5c3");
  });

  it("conflict: the digit is already placed in a peer", () => {
    const d = only(SAMPLE_EASY, [place(R1C3, 3)]);
    expect(d.diagnosis).toEqual({ kind: "conflict", conflictCells: [1] }); // the given 3 in r1c2
  });

  it("conflict wins over typo when both match", () => {
    // 3 is next to the true 4 on the number row and entered fast, but it is visibly in r1c2.
    const d = only(SAMPLE_EASY, [place(0, 5), { ...place(R1C3, 3, "keyboard", "Digit3"), gap: 300 }]);
    expect(d.diagnosis.kind).toBe("conflict");
  });

  it("typo: fast, and on a number-row key next to the solution digit", () => {
    const d = only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R2C7, 4, "keyboard", "Digit4"), gap: 400 }]);
    expect(d.diagnosis).toEqual({ kind: "typo", intended: 3, gapMs: 400, layout: "number-row" });
  });

  it("typo uses the pad and numpad layouts from the event's input and key", () => {
    // 8 touches 9 on every layout.
    expect(only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R1C7, 8, "pad"), gap: 900 }]).diagnosis).toMatchObject({
      kind: "typo",
      layout: "pad",
    });
    expect(
      only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R1C7, 8, "keyboard", "Numpad8"), gap: 900 }]).diagnosis,
    ).toMatchObject({ kind: "typo", layout: "numpad" });
    // 4 is beside 3 on the number row but two columns away on the pad: not a typo there.
    expect(only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R2C7, 4, "pad"), gap: 400 }]).diagnosis.kind).toBe(
      "deduction",
    );
  });

  it("not a typo when slow, when first on the path, or entered digit-first", () => {
    expect(only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R2C7, 4), gap: 1500 }]).diagnosis.kind).toBe("deduction");
    expect(only(SAMPLE_EASY, [{ ...place(R2C7, 4), gap: 0 }]).diagnosis.kind).toBe("deduction");
    expect(only(SAMPLE_EASY, [place(R5C2, 2), { ...place(R2C7, 4, "digit-first"), gap: 200 }]).diagnosis.kind).toBe(
      "deduction",
    );
  });

  it("guess: no step at the puzzle's level applies at S", () => {
    // Play the 28 placements singles allow, then place a wrong digit: singles find nothing.
    const solve = solveLogically(fromGrid(parseGrid(EXPERT.puzzle)), "easy");
    expect(solve.solved).toBe(false);
    const placements = solve.steps.flatMap((s) => s.placements.map((p) => place(p.cell, p.digit)));
    const stuck = solve.stuckState!;
    const cell = stuck.values.findIndex((v) => v === 0);
    const truth = Number(EXPERT.solution[cell]);
    const wrongDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((x) => x !== truth && (stuck.candidates[cell]! & digitBit(x as Digit)) !== 0)!;
    const d = only(EXPERT, [...placements, place(cell, wrongDigit)], "easy");
    expect(d.diagnosis).toEqual({ kind: "guess", stepsTried: 0 });
    expect(d.available).toBeNull();
  });

  it("guess: logic at the level stalls before settling the cell", () => {
    // r1c1 of the Expert puzzle is not reached by singles from the start (it is 4).
    const d = only(EXPERT, [place(0, 5)], "easy");
    expect(d.diagnosis).toEqual({ kind: "guess", stepsTried: 28 });
    expect(d.available?.technique).toBeDefined();
  });

  it("deduction: names the eliminating step's technique, cells and explanation, and the steps before it", () => {
    // 5 in r5c2: the very first step places 5 in r5c5, a row peer.
    const d = only(SAMPLE_EASY, [place(R5C2, 5)]);
    expect(d.diagnosis.kind).toBe("deduction");
    if (d.diagnosis.kind !== "deduction") return;
    const { step, stepsBefore, outcome } = d.diagnosis;
    expect(step.technique).toBe("naked-single");
    expect(step.placements).toEqual([{ cell: 40, digit: 5 }]);
    expect(step.cells).toContain(40);
    expect(step.explanation).toBe("r5c5 can only hold 5");
    expect(stepsBefore).toBe(0);
    expect(outcome).toBe("eliminated");
    expect(d.available).toEqual(step);
    expect(d.summary).toContain("r5c5 can only hold 5");
  });

  it("deduction: counts the steps that preceded the ruling one", () => {
    // 9 in r5c3 survives the first two steps; the third places 9 in r5c8, a row peer.
    const d = only(SAMPLE_EASY, [place(R5C3, 9)]);
    expect(d.diagnosis).toMatchObject({ kind: "deduction", stepsBefore: 2, outcome: "eliminated" });
    if (d.diagnosis.kind === "deduction") {
      expect(d.diagnosis.step.technique).toBe("naked-single");
      expect(d.diagnosis.step.explanation).toBe("r5c8 can only hold 9");
      expect(d.diagnosis.step.cells).toContain(43);
    }
    expect(d.available?.explanation).toBe("r5c5 can only hold 5");
  });

  it("deduction: a removed solution note is refuted by the step that places the digit", () => {
    const d = only(SAMPLE_EASY, [{ type: "auto-notes" }, { type: "note", cell: R5C2, digit: 2, on: false }]);
    expect(d.diagnosis).toMatchObject({ kind: "deduction", stepsBefore: 1, outcome: "placed" });
    if (d.diagnosis.kind === "deduction") expect(d.diagnosis.step.explanation).toBe(`${cellName(R5C2)} can only hold 2`);
  });

  it("does not modify the record or the report", () => {
    const r = recordOf(SAMPLE_EASY, [place(R5C3, 2), place(R5C2, 5), place(R1C3, 3)], "easy");
    const copy = structuredClone(r);
    const report = findMistakes(r);
    const reportCopy = structuredClone(report);
    for (const m of report.mistakes) diagnose(report, m, "easy");
    expect(r).toEqual(copy);
    expect(report).toEqual(reportCopy);
  });
});

describe("keyboard and pad adjacency", () => {
  it("matches each layout", () => {
    expect(keysAdjacent("number-row", 3, 4)).toBe(true);
    expect(keysAdjacent("number-row", 1, 3)).toBe(false);
    expect(keysAdjacent("pad", 1, 5)).toBe(true); // diagonal
    expect(keysAdjacent("pad", 3, 4)).toBe(false); // row ends
    expect(keysAdjacent("numpad", 7, 4)).toBe(true);
    expect(keysAdjacent("numpad", 7, 1)).toBe(false);
    expect(keysAdjacent("pad", 5, 5)).toBe(false);
  });

  it("property: adjacency is symmetric and the pad centre touches every other key", () => {
    const digit = fc.constantFrom(...DIGITS);
    fc.assert(
      fc.property(fc.constantFrom("pad", "numpad", "number-row" as const), digit, digit, (layout, a, b) => {
        expect(keysAdjacent(layout, a, b)).toBe(keysAdjacent(layout, b, a));
        if (layout !== "number-row" && a === 5 && b !== 5) expect(keysAdjacent(layout, a, b)).toBe(true);
      }),
    );
  });

  it("reads the layout from input and key", () => {
    const base = { id: 0, parent: -1, at: 0, elapsed: 0, cell: 0, digit: 1 } as const;
    expect(inputLayout({ ...base, type: "place", input: "pad" })).toBe("pad");
    expect(inputLayout({ ...base, type: "place", input: "keyboard", key: "Numpad1" })).toBe("numpad");
    expect(inputLayout({ ...base, type: "place", input: "keyboard", key: "1" })).toBe("number-row");
    expect(inputLayout({ ...base, type: "place", input: "keyboard" })).toBe("number-row");
    expect(inputLayout({ ...base, type: "place", input: "digit-first" })).toBeNull();
  });
});

describe("diagnose: invariants", () => {
  const givens = parseGrid(SAMPLE_EASY.puzzle);
  const solution = parseGrid(SAMPLE_EASY.solution);
  const empties = givens.flatMap((v, i) => (v === 0 ? [i] : []));

  it("property: a deduction never eliminates a solution digit and always settles the mistake's cell", () => {
    const move = fc.record({
      cell: fc.constantFrom(...empties),
      digit: fc.integer({ min: 1, max: 9 }),
      gap: fc.integer({ min: 0, max: 4000 }),
      input: fc.constantFrom<InputMethod>("keyboard", "pad", "digit-first"),
    });
    fc.assert(
      fc.property(fc.array(move, { minLength: 1, maxLength: 30 }), (moves) => {
        const events = moves.map((m) => ({ ...place(m.cell, m.digit, m.input), gap: m.gap }));
        for (const d of diagnosesOf(SAMPLE_EASY, events)) {
          const { diagnosis, mistake } = d;
          if (diagnosis.kind === "consequence") {
            expect(PEERS[mistake.cell]).toContain(diagnosis.wrongCell);
            expect(mistake.before.board[diagnosis.wrongCell]).toBe(mistake.solutionDigit);
          }
          if (diagnosis.kind !== "deduction") continue;
          const { step } = diagnosis;
          for (const e of step.eliminations) expect(e.digit).not.toBe(solution[e.cell]);
          for (const p of step.placements) expect(p.digit).toBe(solution[p.cell]);
          const touches =
            step.eliminations.some((e) => e.cell === mistake.cell && e.digit === mistake.digit) ||
            step.placements.some((p) => p.cell === mistake.cell || (p.digit === mistake.digit && PEERS[mistake.cell]!.includes(p.cell)));
          expect(touches).toBe(true);
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("diagnose: performance", () => {
  // grade.perf.test.ts reference seed 21, a Master puzzle, so deductions need long solves.
  const MASTER_PUZZLE = "2..6...7...9...86.....25..95.1.4..2...........2..6.7.33..15.....68...5...9...3..6";

  it("diagnoses a 300-event record in under 100 ms", () => {
    const grid = parseGrid(MASTER_PUZZLE);
    const solved = solve(grid)!;
    const p: Puzzle = { puzzle: MASTER_PUZZLE, solution: solved.join("") };
    // Before each correct placement, place a wrong digit that is still a candidate (so the
    // diagnosis has to search for a deduction rather than stop at a visible conflict) and erase
    // it. Every mistake starts from a different state; notes pad the record to 300 events.
    const board = [...grid];
    const events: Timed[] = [];
    const empty = grid.flatMap((v, i) => (v === 0 ? [i] : []));
    for (let i = 0; i < empty.length; i++) {
      const cell = empty[(i * 7) % empty.length]!;
      const truth = solved[cell]!;
      const candidates = computeCandidates(board)[cell]!;
      const wrong = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((d) => d !== truth && (candidates & digitBit(d)) !== 0);
      if (wrong) events.push(place(cell, wrong), { type: "erase", cell });
      events.push(place(cell, truth));
      board[cell] = truth;
    }
    for (let i = 0; events.length < 300; i++) events.push({ type: "note", cell: empty[i % empty.length]!, digit: 1, on: i % 2 === 0 });
    expect(events).toHaveLength(300);
    const record = recordOf(p, events, "master");
    const first = diagnoseRecord(record); // warm-up, as the worker pays JIT once
    expect(first.diagnoses.filter((d) => d.diagnosis.kind === "deduction").length).toBeGreaterThan(20);
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      diagnoseRecord(record);
      times.push(performance.now() - start);
    }
    // Median, so one GC pause under parallel test load does not fail the suite.
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(100);
  });
});
