import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PEERS, fromGrid, nextStep, parseGrid, type Level } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import type { GameRecord } from "../state/events";
import { append, type NewBoardEvent, type Tree } from "../state/tree";
import { findMistakes } from "./mistakes";
import { analyzeMistakes, type MistakeReport } from "./report";

type Body = NewBoardEvent extends infer E ? (E extends unknown ? Omit<E, "at" | "elapsed"> : never) : never;

const place = (cell: number, digit: number): Body => ({ type: "place", cell, digit, input: "keyboard" });
const erase = (cell: number): Body => ({ type: "erase", cell });
const noteOff = (cell: number, digit: number): Body => ({ type: "note", cell, digit, on: false });
const autoNotes: Body = { type: "auto-notes" };

function recordOf(events: Body[], level: Level = "easy"): GameRecord {
  let at = 1_000_000;
  const tree = events.reduce<Tree>(
    (t, body) => {
      at += 5000;
      return append(t, { ...body, at, elapsed: at } as NewBoardEvent);
    },
    { nodes: [], cursor: -1 },
  );
  return {
    version: 1,
    id: "test",
    puzzle: SAMPLE_EASY.puzzle,
    solution: SAMPLE_EASY.solution,
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

const SOLUTION = parseGrid(SAMPLE_EASY.solution);
const GIVENS = parseGrid(SAMPLE_EASY.puzzle);
const truth = (cell: number) => SOLUTION[cell]!;

// Sample cells (solution digit, candidates at the start in brackets).
const R1C3 = 2; // 4 [124]
const R1C7 = 6; // 9 [1489]
const R4C2 = 28; // 5
const R4C6 = 32; // 1
const R5C2 = 37; // 2 [25]
const R5C3 = 38; // 6 [2569]

// r5c3 = 2 hides r5c2's 2, so r5c2 takes 5; that hides r4c2's 5, so r4c2 takes 1; that hides
// r4c6's 1, so r4c6 takes 7. A correct move and an unrelated mistake sit in between.
const CASCADE_PATH: Body[] = [
  place(R5C3, 2), // 0: root
  place(R5C2, 5), // 1: cascade
  place(R1C3, 4), // 2: correct, independent
  place(R4C2, 1), // 3: cascade
  place(R1C7, 1), // 4: wrong, independent of the root
  place(R4C6, 7), // 5: cascade
];

describe("analyzeMistakes", () => {
  it("is empty for a clean path", () => {
    const r = analyzeMistakes(recordOf([place(R1C3, 4), place(R5C3, 6)]));
    expect(r.root).toBeNull();
    expect(r.alternative).toBeNull();
    expect(r.cascade).toEqual([]);
    expect(r.mistakes).toEqual([]);
    expect(r.highlight).toEqual([]);
    expect(r.pathLength).toBe(2);
  });

  it("alternative is nextStep at the state before the root", () => {
    const record = recordOf([place(R1C3, 4), place(R5C2, 2), place(R5C3, 5)]);
    const r = analyzeMistakes(record);
    expect(r.root!.mistake.cell).toBe(R5C3);
    const before = findMistakes(record).root!.before.board;
    expect(before[R1C3]).toBe(4);
    expect(r.alternative).toEqual(nextStep(fromGrid(before), "easy"));
    expect(r.alternative).not.toBeNull();
  });

  it("follows a 3-move cascade and leaves independent moves out", () => {
    const r = analyzeMistakes(recordOf(CASCADE_PATH));
    expect(r.mistakes.map((d) => d.mistake.eventId)).toEqual([0, 1, 3, 4, 5]);
    expect(r.root!.mistake.cell).toBe(R5C3);
    expect(r.cascade).toEqual([
      { eventId: 1, index: 1, cell: R5C2, digit: 5, move: "placement", wrong: true, dependsOn: R5C3 },
      { eventId: 3, index: 3, cell: R4C2, digit: 1, move: "placement", wrong: true, dependsOn: R5C2 },
      { eventId: 5, index: 5, cell: R4C6, digit: 7, move: "placement", wrong: true, dependsOn: R4C2 },
    ]);
    expect(truth(R4C6)).toBe(1);
    // The root's own diagnosis drives the highlight: root cell first.
    expect(r.highlight[0]).toBe(R5C3);
  });

  it("stops following a wrong cell once it is erased", () => {
    const r = analyzeMistakes(recordOf([place(R5C3, 2), erase(R5C3), place(R5C2, 5)]));
    expect(r.cascade).toEqual([]);
  });

  it("stops following a wrong cell once a move outside the cascade overwrites it", () => {
    const r = analyzeMistakes(recordOf([place(R5C3, 2), place(R5C3, 9), place(R5C2, 5)]));
    expect(r.cascade).toEqual([]);
  });

  it("includes a correct placement whose solution digit a cascade cell already holds", () => {
    // Both r5c3 and r5c2 now hold 2; the correct 2 in r5c2 sits on top of the error.
    const r = analyzeMistakes(recordOf([place(R5C3, 2), place(R5C2, 2)]));
    expect(r.cascade).toEqual([
      { eventId: 1, index: 1, cell: R5C2, digit: 2, move: "placement", wrong: false, dependsOn: R5C3 },
    ]);
  });

  it("includes a removed solution note hidden by a cascade cell", () => {
    // Placing r5c3 = 2 clears r5c2's 2 note, so the player writes it back before removing it.
    const r = analyzeMistakes(recordOf([place(R5C3, 2), { type: "note", cell: R5C2, digit: 2, on: true }, noteOff(R5C2, 2)]));
    expect(r.mistakes[1]!.diagnosis.kind).toBe("consequence");
    expect(r.cascade).toEqual([
      { eventId: 2, index: 2, cell: R5C2, digit: 2, move: "note", wrong: true, dependsOn: R5C3 },
    ]);
  });

  it("carries a removed solution note root into a later wrong placement in that cell", () => {
    const r = analyzeMistakes(recordOf([autoNotes, noteOff(R5C3, 6), place(R5C3, 5), place(R5C2, 2)]));
    expect(r.root!.mistake.kind).toBe("removed-solution-note");
    expect(r.cascade.map((m) => [m.cell, m.dependsOn])).toEqual([[R5C3, R5C3]]);
  });

  it("is serializable across the worker boundary", () => {
    const r = analyzeMistakes(recordOf(CASCADE_PATH));
    expect(r.root).not.toBeNull();
    const json: unknown = JSON.parse(JSON.stringify(r));
    expect(json).toEqual(r);
    expect(structuredClone(r)).toEqual(r);
  });

  it("does not modify the record", () => {
    const record = recordOf(CASCADE_PATH);
    const copy = structuredClone(record);
    analyzeMistakes(record);
    expect(record).toEqual(copy);
  });
});

describe("cascade properties", () => {
  const empties = GIVENS.flatMap((v, i) => (v === 0 ? [i] : []));
  const arbEvent = fc.oneof(
    fc.record({ type: fc.constant("place" as const), cell: fc.constantFrom(...empties), digit: fc.integer({ min: 1, max: 9 }), input: fc.constant("keyboard" as const) }),
    fc.record({ type: fc.constant("erase" as const), cell: fc.constantFrom(...empties) }),
  );

  it("every cascade move comes after the root, has a wrong peer holding its solution digit, and is serializable", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { minLength: 1, maxLength: 30 }), (events) => {
        const record = recordOf(events as Body[]);
        const r: MistakeReport = analyzeMistakes(record);
        if (!r.root) {
          expect(r.cascade).toEqual([]);
          return;
        }
        const { states } = findMistakes(record).replay;
        let last = r.root.mistake.index;
        for (const m of r.cascade) {
          expect(m.index).toBeGreaterThan(last);
          last = m.index;
          const board = states[m.index]!.board;
          expect(PEERS[m.cell]).toContain(m.dependsOn);
          expect(board[m.dependsOn]).toBe(truth(m.cell));
          expect(board[m.dependsOn]).not.toBe(truth(m.dependsOn));
          expect(m.wrong).toBe(m.digit !== truth(m.cell));
        }
        expect(JSON.parse(JSON.stringify(r))).toEqual(r);
      }),
      { numRuns: 60 },
    );
  });
});
