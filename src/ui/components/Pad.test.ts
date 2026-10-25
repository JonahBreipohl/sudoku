import { describe, expect, it } from "vitest";
import type { CellValue } from "../../engine";
import { createGameStore, newGameRecord } from "../../state/store";
import { SAMPLE_EASY } from "../../engine/samples";
import { remainingCounts } from "./Pad";

describe("remainingCounts", () => {
  it("counts givens and clamps at zero", () => {
    const board: CellValue[] = new Array<CellValue>(81).fill(0);
    for (let i = 0; i < 11; i++) board[i] = 3;
    const c = remainingCounts(board);
    expect(c[3]).toBe(0);
    expect(c[1]).toBe(9);
  });

  it("tracks place, erase, undo and redo through the store", () => {
    const store = createGameStore(
      newGameRecord({ id: "t", puzzle: SAMPLE_EASY.puzzle, solution: SAMPLE_EASY.solution, level: "easy", createdAt: 0 }),
    );
    const empty = store.getSnapshot().board.indexOf(0);
    const before = remainingCounts(store.getSnapshot().board);
    store.dispatch({ type: "place", cell: empty, digit: 4, input: "pad" });
    expect(remainingCounts(store.getSnapshot().board)[4]).toBe(before[4]! - 1);
    store.dispatch({ type: "undo" });
    expect(remainingCounts(store.getSnapshot().board)[4]).toBe(before[4]);
    store.dispatch({ type: "redo" });
    expect(remainingCounts(store.getSnapshot().board)[4]).toBe(before[4]! - 1);
    store.dispatch({ type: "erase", cell: empty });
    expect(remainingCounts(store.getSnapshot().board)[4]).toBe(before[4]);
  });
});
