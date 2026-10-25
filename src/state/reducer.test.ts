import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { SAMPLE_EASY } from "../engine/samples";
import { digitBit } from "../engine";
import type { BoardEvent } from "./events";
import { createReplayer, replayPath } from "./reducer";

const puzzle = SAMPLE_EASY.puzzle;
const givens = [...puzzle].map((c) => (c === "." ? 0 : Number(c)));
const empties = givens.flatMap((v, i) => (v === 0 ? [i] : []));
const given = givens.findIndex((v) => v !== 0);

type Body =
  | { type: "place"; cell: number; digit: number; input: "keyboard" }
  | { type: "erase"; cell: number }
  | { type: "note"; cell: number; digit: number; on: boolean }
  | { type: "auto-notes" }
  | { type: "reset" }
  | { type: "hint-reveal"; cell: number; digit: number; step: string };

const chain = (bodies: Body[]): BoardEvent[] =>
  bodies.map((b, id) => ({ id, parent: id - 1, at: id, elapsed: id, ...b }) as BoardEvent);

const place = (cell: number, digit: number): Body => ({ type: "place", cell, digit, input: "keyboard" });

describe("board reducer", () => {
  it("starts from the givens", () => {
    const s = replayPath(puzzle, [], -1);
    expect(s.board).toEqual(givens);
    expect(s.notes.every((n) => n === 0)).toBe(true);
    expect(s.conflicts.size).toBe(0);
  });

  it("place removes the digit from peers' notes and clears own notes", () => {
    const a = empties[0]!;
    const nodes = chain([
      { type: "note", cell: a, digit: 5, on: true },
      { type: "note", cell: a, digit: 6, on: true },
      place(a, 5),
    ]);
    expect(replayPath(puzzle, nodes, 1).notes[a]).toBe(digitBit(5) | digitBit(6));
    const s = replayPath(puzzle, nodes, 2);
    expect(s.board[a]).toBe(5);
    expect(s.notes[a]).toBe(0);
  });

  it("peer notes lose the placed digit", () => {
    const a = empties[0]!;
    const peer = empties.find((c) => c !== a && (Math.floor(c / 9) === Math.floor(a / 9)))!;
    const nodes = chain([{ type: "note", cell: peer, digit: 4, on: true }, place(a, 4)]);
    expect(replayPath(puzzle, nodes, 1).notes[peer]).toBe(0);
  });

  it("erase clears values and note off clears one note", () => {
    const a = empties[0]!;
    const nodes = chain([
      place(a, 3),
      { type: "erase", cell: a },
      { type: "note", cell: a, digit: 2, on: true },
      { type: "note", cell: a, digit: 2, on: false },
    ]);
    expect(replayPath(puzzle, nodes, 0).board[a]).toBe(3);
    expect(replayPath(puzzle, nodes, 1).board[a]).toBe(0);
    expect(replayPath(puzzle, nodes, 3).notes[a]).toBe(0);
  });

  it("auto-notes fills empty cells with candidates only", () => {
    const s = replayPath(puzzle, chain([{ type: "auto-notes" }]), 0);
    for (const c of empties) expect(s.notes[c]).not.toBe(0);
    expect(s.notes[given]).toBe(0);
  });

  it("hint-reveal places the digit", () => {
    const a = empties[0]!;
    const nodes = chain([{ type: "hint-reveal", cell: a, digit: 7, step: "naked-single" }]);
    expect(replayPath(puzzle, nodes, 0).board[a]).toBe(7);
  });

  it("reports conflicts", () => {
    const a = empties[0]!;
    const peer = empties.find((c) => c !== a && Math.floor(c / 9) === Math.floor(a / 9))!;
    const s = replayPath(puzzle, chain([place(a, 2), place(peer, 2)]), 1);
    expect(s.conflicts.has(a) && s.conflicts.has(peer)).toBe(true);
  });

  it("never changes givens", () => {
    const nodes = chain([
      place(given, (givens[given]! % 9) + 1),
      { type: "erase", cell: given },
      { type: "hint-reveal", cell: given, digit: 1, step: "x" },
    ]);
    expect(replayPath(puzzle, nodes, 2).board).toEqual(givens);
  });

  it("reset clears non-givens and notes", () => {
    const [a, b] = empties as [number, number];
    const nodes = chain([place(a, 1), { type: "note", cell: b, digit: 2, on: true }, { type: "reset" }]);
    const s = replayPath(puzzle, nodes, 2);
    expect(s.board).toEqual(givens);
    expect(s.notes.every((n) => n === 0)).toBe(true);
  });

  it("follows only the path to the cursor in a branching tree", () => {
    const [a, b] = empties as [number, number];
    const nodes: BoardEvent[] = [
      { id: 0, parent: -1, at: 0, elapsed: 0, ...place(a, 1) } as BoardEvent,
      { id: 1, parent: 0, at: 1, elapsed: 1, ...place(b, 2) } as BoardEvent,
      { id: 2, parent: 0, at: 2, elapsed: 2, ...place(b, 3) } as BoardEvent,
    ];
    expect(replayPath(puzzle, nodes, 1).board[b]).toBe(2);
    expect(replayPath(puzzle, nodes, 2).board[b]).toBe(3);
    expect(replayPath(puzzle, nodes, -1).board).toEqual(givens);
  });
});

const bodyArb: fc.Arbitrary<Body> = fc.oneof(
  fc.record({ type: fc.constant("place" as const), cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }), input: fc.constant("keyboard" as const) }),
  fc.record({ type: fc.constant("erase" as const), cell: fc.integer({ min: 0, max: 80 }) }),
  fc.record({ type: fc.constant("note" as const), cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }), on: fc.boolean() }),
  fc.constant({ type: "auto-notes" as const }),
  fc.constant({ type: "reset" as const }),
  fc.record({ type: fc.constant("hint-reveal" as const), cell: fc.integer({ min: 0, max: 80 }), digit: fc.integer({ min: 1, max: 9 }), step: fc.constant("s") }),
);

describe("replay properties", () => {
  it("replaying the same path twice gives identical state, with or without snapshots", () => {
    fc.assert(
      fc.property(fc.array(bodyArb, { maxLength: 200 }), (bodies) => {
        const nodes = chain(bodies);
        const cursor = nodes.length - 1;
        const fresh = replayPath(puzzle, nodes, cursor);
        expect(replayPath(puzzle, nodes, cursor)).toEqual(fresh);
        const r = createReplayer(puzzle);
        expect(r.derive(nodes, cursor)).toEqual(fresh);
        expect(r.derive(nodes, cursor)).toEqual(fresh);
        for (let i = 0; i < givens.length; i++) if (givens[i]) expect(fresh.board[i]).toBe(givens[i]);
      }),
      { numRuns: 100 },
    );
  });

  it("branches that diverge before a snapshot boundary replay the same as a cold replay", () => {
    const bodiesArb = fc.array(bodyArb, { minLength: 70, maxLength: 70 });
    fc.assert(
      fc.property(bodiesArb, bodiesArb, bodiesArb, (main, branchA, branchB) => {
        // Nodes are append-only, so ids equal indices. Undo to node 61 (before the snapshot at 63),
        // then grow two branches from there; each branch crosses a snapshot boundary of its own.
        const nodes: BoardEvent[] = [];
        const extend = (parent: number, bodies: Body[]): number => {
          for (const body of bodies) {
            const id = nodes.length;
            nodes.push({ id, parent, at: id, elapsed: id, ...body } as BoardEvent);
            parent = id;
          }
          return parent;
        };
        const mainEnd = extend(-1, main); // ids 0..69, snapshot at 63 on this path
        const undoPoint = 61;
        const endA = extend(undoPoint, branchA); // ids 70..139, snapshot at 127 on this path
        const endB = extend(undoPoint, branchB); // ids 140..209, snapshot at 191 on this path

        const r = createReplayer(puzzle);
        const cursors = [undoPoint, mainEnd, endA, endB, mainEnd, endA, endB];
        for (const cursor of cursors) {
          expect(r.derive(nodes, cursor)).toEqual(replayPath(puzzle, nodes, cursor));
        }
      }),
      { numRuns: 30 },
    );
  });

  it("replays 2,000 events in under 5 ms once snapshots exist", () => {
    const bodies: Body[] = Array.from({ length: 2000 }, (_, i) => {
      const cell = empties[i % empties.length]!;
      return i % 3 === 0 ? place(cell, (i % 9) + 1) : i % 3 === 1 ? { type: "note", cell, digit: (i % 9) + 1, on: true } : { type: "erase", cell };
    });
    const nodes = chain(bodies);
    const r = createReplayer(puzzle);
    r.derive(nodes, 1998); // warm snapshots as the store would while events are appended
    const t0 = performance.now();
    r.derive(nodes, 1999);
    expect(performance.now() - t0).toBeLessThan(5);
  });
});
