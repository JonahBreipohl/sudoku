import { describe, expect, it } from "vitest";
import { moveSelection } from "./selection";

describe("moveSelection", () => {
  it("wraps around every edge", () => {
    expect(moveSelection(0, "up")).toBe(72);
    expect(moveSelection(72, "down")).toBe(0);
    expect(moveSelection(0, "left")).toBe(8);
    expect(moveSelection(8, "right")).toBe(0);
  });
  it("moves one step inside the board", () => {
    expect(moveSelection(40, "up")).toBe(31);
    expect(moveSelection(40, "down")).toBe(49);
    expect(moveSelection(40, "left")).toBe(39);
    expect(moveSelection(40, "right")).toBe(41);
  });
});
