import { describe, expect, it } from "vitest";
import { createGameStore, newGameRecord } from "./store";
import { checkBoard, checkMessage, wrongCells } from "./check";

const solution = "123456789".repeat(9);
const puzzle = "1" + "0".repeat(80);

describe("wrongCells", () => {
  it("ignores givens and empty cells", () => {
    const board = Array<number>(81).fill(0);
    board[0] = 1;
    expect(wrongCells(puzzle, solution, board)).toEqual([]);
  });
  it("flags only entries that differ from the solution", () => {
    const board = Array<number>(81).fill(0);
    board[0] = 1;
    board[1] = 2; // right
    board[2] = 9; // wrong
    board[80] = 1; // wrong
    expect(wrongCells(puzzle, solution, board)).toEqual([2, 80]);
  });
});

describe("check", () => {
  it("messages never reveal digits", () => {
    expect(checkMessage(0)).toBe("On track");
    expect(checkMessage(1)).toBe("1 error");
    expect(checkMessage(3)).toBe("3 errors");
  });
  it("logs a check meta event with the mistake count and leaves the board alone", () => {
    const store = createGameStore(newGameRecord({ id: "g", puzzle, solution, level: "easy", createdAt: 0 }), { now: () => 5 });
    store.dispatch({ type: "place", cell: 2, digit: 9, input: "keyboard" });
    const before = store.getSnapshot();
    const { mistakes } = checkBoard(before.record, before.board);
    store.dispatch({ type: "check", mistakes });
    const after = store.getSnapshot();
    expect(after.record.log.at(-1)).toEqual({ type: "check", mistakes: 1, at: 5 });
    expect(after.board).toEqual(before.board);
    expect(after.record.nodes).toBe(before.record.nodes);
  });
});
