import { describe, expect, it } from "vitest";
import { parseGrid } from "../engine";
import { SAMPLE_EASY } from "../engine/samples";
import { initSkeleton, skeletonReducer } from "./skeleton";

const givens = parseGrid(SAMPLE_EASY.puzzle);
const firstBlank = givens.indexOf(0);
const firstGiven = givens.findIndex((v) => v !== 0);

describe("skeletonReducer", () => {
  it("selects and moves with wrap-around", () => {
    let s = skeletonReducer(initSkeleton(givens), { type: "select", cell: 0 });
    s = skeletonReducer(s, { type: "move", direction: "up" });
    expect(s.selected).toBe(72);
    s = skeletonReducer(s, { type: "move", direction: "left" });
    expect(s.selected).toBe(80);
    s = skeletonReducer(s, { type: "move", direction: "right" });
    s = skeletonReducer(s, { type: "move", direction: "down" });
    expect(s.selected).toBe(0);
  });

  it("moving with nothing selected starts from the first cell", () => {
    const s = skeletonReducer(initSkeleton(givens), { type: "move", direction: "right" });
    expect(s.selected).toBe(1);
  });

  it("places and erases in empty cells only", () => {
    let s = skeletonReducer(initSkeleton(givens), { type: "select", cell: firstBlank });
    s = skeletonReducer(s, { type: "place", digit: 4 });
    expect(s.board[firstBlank]).toBe(4);
    s = skeletonReducer(s, { type: "erase" });
    expect(s.board[firstBlank]).toBe(0);

    s = skeletonReducer(s, { type: "select", cell: firstGiven });
    const before = s;
    expect(skeletonReducer(s, { type: "place", digit: 1 })).toBe(before);
    expect(skeletonReducer(s, { type: "erase" })).toBe(before);
  });

  it("ignores input with no selection", () => {
    const s = initSkeleton(givens);
    expect(skeletonReducer(s, { type: "place", digit: 3 })).toBe(s);
  });
});
