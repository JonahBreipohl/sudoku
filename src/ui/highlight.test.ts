import { describe, expect, it } from "vitest";
import { highlightsFor } from "./highlight";

const empty = () => ({ board: new Array(81).fill(0), notes: new Array(81).fill(0), conflicts: new Set<number>() });

describe("highlightsFor", () => {
  it("highlights nothing without a selection", () => {
    const h = highlightsFor(empty(), null);
    expect(h.every((x) => !x.selected && !x.related && !x.sameDigit && x.noteDigit === 0 && !x.conflict)).toBe(true);
  });

  it("marks the selection and its 20 peers", () => {
    const h = highlightsFor(empty(), 40);
    expect(h.filter((x) => x.selected)).toHaveLength(1);
    expect(h.filter((x) => x.related)).toHaveLength(20);
    expect(h[40]!.related).toBe(false);
  });

  it("marks same digits and notes containing the digit", () => {
    const s = empty();
    s.board[0] = 5;
    s.board[50] = 5;
    s.board[51] = 6;
    s.notes[20] = 1 << 4;
    s.notes[21] = 1 << 3;
    const h = highlightsFor(s, 0);
    expect(h[50]!.sameDigit).toBe(true);
    expect(h[0]!.sameDigit).toBe(false);
    expect(h[51]!.sameDigit).toBe(false);
    expect(h[20]!.noteDigit).toBe(5);
    expect(h[21]!.noteDigit).toBe(0);
  });

  it("selecting an empty cell highlights no digits", () => {
    const s = empty();
    s.board[3] = 7;
    s.notes[4] = 0b1111111;
    const h = highlightsFor(s, 0);
    expect(h.some((x) => x.sameDigit || x.noteDigit !== 0)).toBe(false);
  });

  it("reports conflicts independent of selection and is pure", () => {
    const s = empty();
    s.conflicts.add(9);
    const before = JSON.stringify([...s.board]);
    expect(highlightsFor(s, null)[9]!.conflict).toBe(true);
    expect(highlightsFor(s, 80)[9]!.conflict).toBe(true);
    expect(JSON.stringify([...s.board])).toBe(before);
  });
});
