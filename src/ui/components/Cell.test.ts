import { describe, expect, it } from "vitest";
import { cellLabel } from "./Cell";

const mask = (...ds: number[]) => ds.reduce((m, d) => m | (1 << (d - 1)), 0);

describe("cellLabel", () => {
  it("lists notes on empty cells", () => {
    expect(cellLabel(0, 0, false, mask(1, 4, 9), false)).toBe("Row 1, column 1, empty, notes 1 4 9");
  });
  it("says plain empty with no notes", () => {
    expect(cellLabel(10, 0, false, 0, false)).toBe("Row 2, column 2, empty");
  });
  it("marks givens and conflicts", () => {
    expect(cellLabel(80, 5, true, 0, false)).toBe("Row 9, column 9, 5, given");
    expect(cellLabel(80, 5, false, 0, true)).toBe("Row 9, column 9, 5, conflict");
  });
});
