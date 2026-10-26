import { describe, expect, it } from "vitest";
import type { Grid } from "../engine";
import { describeChange, describeCheck } from "./announce";

type Mut = number[] & Grid;
const empty = () => Array<number>(81).fill(0) as Mut;
const view = (board: Grid, conflicts: number[] = []) => ({ board, conflicts: new Set(conflicts) });
const SOL = "1".repeat(81);

describe("describeChange", () => {
  it("announces a placement with its position", () => {
    const b = empty();
    b[10] = 4;
    expect(describeChange(view(empty()), view(b), SOL)).toBe("Placed 4 at row 2, column 2.");
  });
  it("adds a conflict cue", () => {
    const b = empty();
    b[0] = 4;
    expect(describeChange(view(empty()), view(b, [0]), SOL)).toContain("Conflict");
  });
  it("announces an erase", () => {
    const a = empty();
    a[80] = 3;
    expect(describeChange(view(a), view(empty()), SOL)).toBe("Cleared row 9, column 9.");
  });
  it("is silent when the board is unchanged (notes)", () => {
    expect(describeChange(view(empty()), view(empty()), SOL)).toBeNull();
  });
  it("summarizes multi-cell changes", () => {
    const b = empty();
    b[0] = 1;
    b[1] = 2;
    expect(describeChange(view(empty()), view(b), SOL)).toBe("Board updated.");
  });
  it("announces completion", () => {
    const b = Array<number>(81).fill(1) as Mut;
    const a = [...b] as Mut;
    a[5] = 0;
    expect(describeChange(view(a), view(b), SOL)).toMatch(/^Puzzle complete/);
  });
});

describe("describeCheck", () => {
  it("wraps the check message", () => {
    expect(describeCheck(0)).toBe("Check: On track.");
    expect(describeCheck(2)).toBe("Check: 2 errors.");
  });
});
