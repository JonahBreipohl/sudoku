import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createReplayer } from "./reducer";
import {
  append,
  path,
  redo,
  rewind,
  undo,
  type NewBoardEvent,
  type Tree,
} from "./tree";

const PUZZLE = ".".repeat(81);
const empty: Tree = { nodes: [], cursor: -1 };
const base = { at: 0, elapsed: 0 };
const place = (cell: number, digit: number): NewBoardEvent => ({
  ...base,
  type: "place",
  cell,
  digit,
  input: "keyboard",
});
const reset: NewBoardEvent = { ...base, type: "reset" };

describe("tree", () => {
  it("undo then redo returns to the same state", () => {
    const t = append(append(empty, place(0, 1)), place(1, 2));
    expect(redo(undo(t))).toEqual(t);
  });

  it("branches after undo and keeps old nodes; redo follows the newest branch", () => {
    let t = append(append(empty, place(0, 1)), place(1, 2));
    t = append(undo(t), place(2, 3));
    expect(t.nodes).toHaveLength(3);
    expect(t.nodes[2]!.parent).toBe(0);
    expect(path(t).map((n) => n.id)).toEqual([0, 2]);
    expect(redo(undo(t)).cursor).toBe(2);
    expect(rewind(t, 1).cursor).toBe(1);
  });

  it("undoing a reset restores the previous board", () => {
    const r = createReplayer(PUZZLE);
    const before = append(empty, place(4, 5));
    const after = append(before, reset);
    expect(
      r.derive(after.nodes, after.cursor).board.every((v) => v === 0),
    ).toBe(true);
    expect(r.derive(undo(after).nodes, undo(after).cursor).board[4]).toBe(5);
  });

  it("is a no-op at the ends and rejects unknown rewind targets", () => {
    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);
    expect(() => rewind(empty, 0)).toThrow(RangeError);
    expect(rewind(append(empty, reset), -1).cursor).toBe(-1);
  });

  const action = fc.oneof(
    fc.record({
      k: fc.constant("append" as const),
      cell: fc.nat(80),
      digit: fc.integer({ min: 1, max: 9 }),
    }),
    fc.record({ k: fc.constant("undo" as const) }),
    fc.record({ k: fc.constant("redo" as const) }),
    fc.record({ k: fc.constant("rewind" as const), n: fc.nat(1000) }),
  );

  it("property: nodes are never removed, undo inverts append, parents precede children", () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        let t = empty;
        for (const a of actions) {
          const prev = t;
          if (a.k === "append") {
            t = append(t, place(a.cell, a.digit));
            expect(undo(t).cursor).toBe(prev.cursor);
          } else if (a.k === "undo") t = undo(t);
          else if (a.k === "redo") t = redo(t);
          else t = rewind(t, (a.n % (t.nodes.length + 1)) - 1);
          // Prior nodes are untouched, only ever extended.
          expect(t.nodes.slice(0, prev.nodes.length)).toEqual(prev.nodes);
          expect(t.nodes.length).toBeGreaterThanOrEqual(prev.nodes.length);
          t.nodes.forEach((n, i) => {
            expect(n.id).toBe(i);
            expect(n.parent).toBeLessThan(i);
          });
          expect(path(t).at(-1)?.id ?? -1).toBe(t.cursor);
        }
      }),
    );
  });
});
