import { describe, expect, it } from "vitest";
import type { BoardEvent } from "../state/events";
import { append, undo, type Tree } from "../state/tree";
import { cellName, describeEvent, historyEntries } from "./moveHistory";
import { formatElapsed, formatWallClock } from "./clock";

const base = { at: 0, elapsed: 0 };
const place = (cell: number, digit: number) =>
  ({ type: "place", cell, digit, input: "keyboard", ...base }) as const;

describe("describeEvent", () => {
  const ev = (e: object) => ({ id: 0, parent: -1, ...base, ...e }) as BoardEvent;
  it("reads cells as rNcM", () => {
    expect(cellName(0)).toBe("r1c1");
    expect(cellName(22)).toBe("r3c5");
    expect(cellName(80)).toBe("r9c9");
  });
  it("describes each event type", () => {
    expect(describeEvent(ev({ type: "place", cell: 22, digit: 7, input: "pad" }))).toBe("r3c5 = 7");
    expect(describeEvent(ev({ type: "erase", cell: 22 }))).toBe("r3c5 erased");
    expect(describeEvent(ev({ type: "note", cell: 22, digit: 4, on: true }))).toBe("r3c5 note 4 added");
    expect(describeEvent(ev({ type: "note", cell: 22, digit: 4, on: false }))).toBe("r3c5 note 4 removed");
    expect(describeEvent(ev({ type: "auto-notes" }))).toBe("Auto-notes filled");
    expect(describeEvent(ev({ type: "reset" }))).toBe("Board reset");
    expect(describeEvent(ev({ type: "hint-reveal", cell: 0, digit: 5, step: "x" }))).toBe("r1c1 = 5 (hint)");
  });
});

describe("historyEntries", () => {
  const empty: Tree = { nodes: [], cursor: -1 };

  it("is empty at a fresh game", () => {
    expect(historyEntries([], -1)).toEqual([]);
  });

  it("lists the path newest first with only the last one current", () => {
    let t = append(empty, place(0, 1));
    t = append(t, place(1, 2));
    t = append(t, place(2, 3));
    const e = historyEntries(t.nodes, t.cursor);
    expect(e.map((x) => x.text)).toEqual(["r1c3 = 3", "r1c2 = 2", "r1c1 = 1"]);
    expect(e.map((x) => x.step)).toEqual([3, 2, 1]);
    expect(e.map((x) => x.current)).toEqual([true, false, false]);
    expect(e.some((x) => x.undone)).toBe(false);
  });

  it("marks the redo chain undone, above the current entry", () => {
    let t = append(empty, place(0, 1));
    t = append(t, place(1, 2));
    t = append(t, place(2, 3));
    t = undo(undo(t));
    const e = historyEntries(t.nodes, t.cursor);
    expect(e.map((x) => [x.text, x.undone, x.current])).toEqual([
      ["r1c3 = 3", true, false],
      ["r1c2 = 2", true, false],
      ["r1c1 = 1", false, true],
    ]);
  });

  it("drops an abandoned branch once a new move replaces it", () => {
    let t = append(empty, place(0, 1));
    t = append(t, place(1, 2));
    t = undo(t);
    t = append(t, place(1, 9));
    const e = historyEntries(t.nodes, t.cursor);
    expect(e.map((x) => x.text)).toEqual(["r1c2 = 9", "r1c1 = 1"]);
    expect(e.every((x) => !x.undone)).toBe(true);
  });

  it("at the start position everything is undone and nothing is current", () => {
    let t = append(empty, place(0, 1));
    t = undo(t);
    const e = historyEntries(t.nodes, t.cursor);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ undone: true, current: false });
  });
});

describe("clock formatting", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_900)).toBe("1:05");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
    expect(formatElapsed(-5)).toBe("0:00");
  });
  it("formats wall time in the locale's format", () => {
    const at = new Date(2026, 0, 1, 15, 5).getTime();
    expect(formatWallClock(at, "en-GB")).toBe("15:05");
    expect(formatWallClock(at, "en-US").replace(/\s/g, " ")).toBe("3:05 PM");
  });
});
