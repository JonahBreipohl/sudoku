import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { SAMPLE_EASY } from "../engine/samples";
import type { BoardEvent, GameRecord } from "../state/events";
import { append, rewind, type NewBoardEvent, type Tree } from "../state/tree";
import { replayPath } from "../state/reducer";
import { findMistakes } from "./mistakes";
import { replayRecord } from "./replay";

const { puzzle, solution } = SAMPLE_EASY;
const truth = (cell: number): number => Number(solution[cell]);
const empties = [...puzzle].flatMap((c, i) => (c === "." ? [i] : []));
const given = [...puzzle].findIndex((c) => c !== ".");
const wrong = (cell: number): number => (truth(cell) % 9) + 1;

type Body = NewBoardEvent extends infer E ? (E extends unknown ? Omit<E, "at" | "elapsed"> : never) : never;

const place = (cell: number, digit: number): Body => ({ type: "place", cell, digit, input: "keyboard" });
const note = (cell: number, digit: number, on: boolean): Body => ({ type: "note", cell, digit, on });

function treeOf(bodies: Body[]): Tree {
  return bodies.reduce<Tree>((t, b, i) => append(t, { ...b, at: i * 1000, elapsed: i * 1000 } as NewBoardEvent), {
    nodes: [],
    cursor: -1,
  });
}

function recordOf(tree: Tree): GameRecord {
  return {
    version: 1,
    id: "test",
    puzzle,
    solution,
    level: "easy",
    score: 0,
    source: "bank",
    createdAt: 0,
    nodes: [...tree.nodes],
    cursor: tree.cursor,
    log: [],
    status: "playing",
  };
}

const record = (bodies: Body[]): GameRecord => recordOf(treeOf(bodies));
const ids = (r: GameRecord) => findMistakes(r).mistakes.map((m) => m.eventId);

describe("findMistakes", () => {
  const [a, b, c] = empties as [number, number, number];

  it("reports nothing for an empty path", () => {
    const report = findMistakes(record([]));
    expect(report.mistakes).toEqual([]);
    expect(report.root).toBeNull();
  });

  it("finds wrong placements in order with event ids; root is the first", () => {
    const r = record([place(a, truth(a)), place(b, wrong(b)), place(c, truth(c)), place(c, wrong(c))]);
    const report = findMistakes(r);
    expect(report.mistakes.map((m) => [m.eventId, m.kind, m.cell, m.digit, m.solutionDigit])).toEqual([
      [1, "wrong-placement", b, wrong(b), truth(b)],
      [3, "wrong-placement", c, wrong(c), truth(c)],
    ]);
    expect(report.root).toBe(report.mistakes[0]);
    expect(report.root!.index).toBe(1);
    // The state before the root has the correct first placement and nothing at b.
    expect(report.root!.before.board[a]).toBe(truth(a));
    expect(report.root!.before.board[b]).toBe(0);
  });

  it("counts a note edit that turns off the true digit", () => {
    const r = record([note(a, truth(a), true), note(a, wrong(a), true), note(a, truth(a), false)]);
    const report = findMistakes(r);
    expect(report.mistakes.map((m) => [m.eventId, m.kind, m.digit])).toEqual([[2, "removed-solution-note", truth(a)]]);
  });

  it("counts the true digit removed from auto-notes", () => {
    expect(ids(record([{ type: "auto-notes" }, note(a, truth(a), false)]))).toEqual([1]);
  });

  it("ignores note edits that change nothing or keep the truth", () => {
    expect(
      ids(
        record([
          note(a, truth(a), false), // already off
          note(a, wrong(a), true),
          note(a, wrong(a), false), // removing a wrong candidate is good play
          note(b, truth(b), true), // adding the truth
          place(c, truth(c)),
          note(c, truth(c), false), // filled cell: the reducer ignores it
        ]),
      ),
    ).toEqual([]);
  });

  it("does not count correct moves, erasures, resets, or edits to givens", () => {
    expect(
      ids(
        record([
          place(a, truth(a)),
          { type: "erase", cell: a },
          place(a, truth(a)),
          { type: "reset" },
          place(given, wrong(given)),
          { type: "hint-reveal", cell: b, digit: truth(b), step: "naked-single" },
          { type: "auto-notes" },
        ]),
      ),
    ).toEqual([]);
  });

  it("still counts a wrong placement that was later erased", () => {
    expect(ids(record([place(a, wrong(a)), { type: "erase", cell: a }, place(a, truth(a))]))).toEqual([0]);
  });

  it("follows only the path to the cursor", () => {
    // Branch 1 has a mistake; the player rewinds to the start and plays correctly on branch 2.
    let t = treeOf([place(a, wrong(a)), place(b, truth(b))]);
    t = rewind(t, -1);
    t = append(t, { ...place(a, truth(a)), at: 5000, elapsed: 5000 } as NewBoardEvent);
    expect(ids(recordOf(t))).toEqual([]);
    expect(ids(recordOf(rewind(t, 1)))).toEqual([0]);
  });

  it("does not modify the record", () => {
    const r = record([place(a, wrong(a)), note(b, truth(b), true), note(b, truth(b), false)]);
    const copy = structuredClone(r);
    findMistakes(r);
    expect(r).toEqual(copy);
  });

  it("property: a record built only from solution placements has no mistakes", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...empties), { maxLength: 120 }), (cells) => {
        const r = record(cells.map((cell) => place(cell, truth(cell))));
        const report = findMistakes(r);
        return report.mistakes.length === 0 && report.root === null;
      }),
    );
  });

  it("property: every wrong placement on the path is reported, in order", () => {
    const move = fc.record({ cell: fc.constantFrom(...empties), correct: fc.boolean() });
    fc.assert(
      fc.property(fc.array(move, { maxLength: 60 }), (moves) => {
        const r = record(moves.map((m) => place(m.cell, m.correct ? truth(m.cell) : wrong(m.cell))));
        const expected = moves.flatMap((m, i) => (m.correct ? [] : [i]));
        expect(ids(r)).toEqual(expected);
      }),
    );
  });
});

describe("replayRecord", () => {
  const event = fc.oneof(
    fc.record({ cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }) }).map((x) => place(x.cell, x.digit)),
    fc.integer({ min: 0, max: 80 }).map((cell): Body => ({ type: "erase", cell })),
    fc
      .record({ cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }), on: fc.boolean() })
      .map((x) => note(x.cell, x.digit, x.on)),
    fc.constant<Body>({ type: "auto-notes" }),
    fc.constant<Body>({ type: "reset" }),
    fc
      .record({ cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }) })
      .map((x): Body => ({ type: "hint-reveal", cell: x.cell, digit: x.digit, step: "s" })),
  );

  it("property: every kept state matches the state reducer", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 40 }), (bodies) => {
        const r = record(bodies);
        const { states, path } = replayRecord(r);
        expect(states).toHaveLength(path.length + 1);
        states.forEach((s, i) => {
          const cursor = i === 0 ? -1 : (path[i - 1] as BoardEvent).id;
          const ref = replayPath(puzzle, r.nodes, cursor);
          expect(s.board).toEqual(ref.board);
          expect(s.notes).toEqual(ref.notes);
        });
      }),
      { numRuns: 100 },
    );
  });
});
