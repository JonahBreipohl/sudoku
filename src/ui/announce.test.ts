import { describe, expect, it } from "vitest";
import type { Grid } from "../engine";
import { describeChange, describeCheck, describeSubmit } from "./announce";

type Mut = number[] & Grid;
const empty = () => Array<number>(81).fill(0) as Mut;
const view = (board: Grid, conflicts: number[] = []) => ({ board, conflicts: new Set(conflicts) });

describe("describeChange", () => {
  it("announces a placement with its position", () => {
    const b = empty();
    b[10] = 4;
    expect(describeChange(view(empty()), view(b))).toBe("Placed 4 at row 2, column 2.");
  });
  it("adds a conflict cue", () => {
    const b = empty();
    b[0] = 4;
    expect(describeChange(view(empty()), view(b, [0]))).toContain("Conflict");
  });
  it("announces an erase", () => {
    const a = empty();
    a[80] = 3;
    expect(describeChange(view(a), view(empty()))).toBe("Cleared row 9, column 9.");
  });
  it("is silent when the board is unchanged (notes)", () => {
    expect(describeChange(view(empty()), view(empty()))).toBeNull();
  });
  it("summarizes multi-cell changes", () => {
    const b = empty();
    b[0] = 1;
    b[1] = 2;
    expect(describeChange(view(empty()), view(b))).toBe("Board updated.");
  });
  it("does not announce completion from a board diff", () => {
    const b = Array<number>(81).fill(1) as Mut;
    const a = [...b] as Mut;
    a[5] = 0;
    expect(describeChange(view(a), view(b))).toBe("Placed 1 at row 1, column 6.");
  });
});

describe("describeSubmit", () => {
  it("announces completion for a solved submit", () => {
    expect(describeSubmit("solved")).toMatch(/^Puzzle complete/);
  });
  it("announces mistakes for an incorrect submit", () => {
    expect(describeSubmit("incorrect")).toMatch(/mistakes/);
  });
});

describe("describeCheck", () => {
  it("wraps the check message", () => {
    expect(describeCheck(0)).toBe("Check: On track.");
    expect(describeCheck(2)).toBe("Check: 2 errors.");
  });
});
