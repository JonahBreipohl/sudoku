import { describe, expect, it, vi } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { isGameRecord } from "./events";
import { createGameStore, newGameRecord, type GameStore } from "./store";

const blank = SAMPLE_EASY.puzzle.indexOf(".");
const given = SAMPLE_EASY.puzzle.search(/[1-9]/);

function make(): GameStore {
  let t = 1000;
  return createGameStore(
    newGameRecord({
      id: "t",
      puzzle: SAMPLE_EASY.puzzle,
      solution: SAMPLE_EASY.solution,
      level: "easy",
      createdAt: 1000,
    }),
    { now: () => t++, elapsed: () => 5 },
  );
}
const place = (s: GameStore, cell = blank, digit = 4) =>
  s.dispatch({ type: "place", cell, digit, input: "keyboard" });

describe("game store", () => {
  it("starts at the starting position with a valid record", () => {
    const snap = make().getSnapshot();
    expect(isGameRecord(snap.record)).toBe(true);
    expect(snap.board.filter((v) => v === 0).length).toBe(SAMPLE_EASY.puzzle.split(".").length - 1);
    expect(snap.canUndo).toBe(false);
    expect(snap.canRedo).toBe(false);
  });

  it("dispatches place, erase, note, auto-notes, reset and hint-reveal", () => {
    const s = make();
    place(s);
    expect(s.getSnapshot().board[blank]).toBe(4);
    s.dispatch({ type: "erase", cell: blank });
    expect(s.getSnapshot().board[blank]).toBe(0);
    s.dispatch({ type: "note", cell: blank, digit: 4, on: true });
    expect(s.getSnapshot().notes[blank]).not.toBe(0);
    s.dispatch({ type: "auto-notes" });
    expect(s.getSnapshot().notes[blank]).not.toBe(0);
    s.dispatch({ type: "hint-reveal", cell: blank, digit: 4, step: "naked-single" });
    expect(s.getSnapshot().board[blank]).toBe(4);
    s.dispatch({ type: "reset" });
    expect(s.getSnapshot().board.join("")).toBe(SAMPLE_EASY.puzzle.replaceAll(".", "0"));
    const { record } = s.getSnapshot();
    expect(record.nodes.map((n) => n.type)).toEqual([
      "place", "erase", "note", "auto-notes", "hint-reveal", "reset",
    ]);
    expect(record.nodes[0]).toMatchObject({ id: 0, parent: -1, elapsed: 5 });
    expect(isGameRecord(record)).toBe(true);
  });

  it("ignores edits to givens and no-op edits without logging", () => {
    const s = make();
    place(s, given);
    s.dispatch({ type: "erase", cell: blank });
    place(s);
    place(s);
    expect(s.getSnapshot().record.nodes).toHaveLength(1);
  });

  it("logs undo, redo and rewind as meta events and moves the cursor", () => {
    const s = make();
    place(s, blank, 4);
    place(s, blank, 5);
    s.dispatch({ type: "undo" });
    expect(s.getSnapshot().board[blank]).toBe(4);
    expect(s.getSnapshot().canRedo).toBe(true);
    s.dispatch({ type: "redo" });
    expect(s.getSnapshot().board[blank]).toBe(5);
    s.dispatch({ type: "rewind", to: -1 });
    expect(s.getSnapshot().board[blank]).toBe(0);
    const { record } = s.getSnapshot();
    expect(record.log.map((e) => e.type)).toEqual(["undo", "redo", "rewind"]);
    expect(record.nodes).toHaveLength(2);
    expect(isGameRecord(record)).toBe(true);
  });

  it("does not log undo/redo that go nowhere", () => {
    const s = make();
    s.dispatch({ type: "undo" });
    s.dispatch({ type: "redo" });
    expect(s.getSnapshot().record.log).toHaveLength(0);
  });

  it("appends other meta events to the log", () => {
    const s = make();
    s.dispatch({ type: "pause" });
    expect(s.getSnapshot().record.log).toMatchObject([{ type: "pause" }]);
  });

  it("notifies subscribers once per change and stops after unsubscribe", () => {
    const s = make();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    place(s);
    expect(listener).toHaveBeenCalledTimes(1);
    place(s); // no-op
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    s.dispatch({ type: "undo" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the snapshot referentially stable until something changes", () => {
    const s = make();
    const a = s.getSnapshot();
    expect(s.getSnapshot()).toBe(a);
    place(s, given);
    expect(s.getSnapshot()).toBe(a);
    place(s);
    expect(s.getSnapshot()).not.toBe(a);
  });
});
