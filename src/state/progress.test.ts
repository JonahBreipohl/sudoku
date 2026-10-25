import { describe, expect, it } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { hasProgress } from "./progress";
import { createGameStore, newGameRecord } from "./store";

const fresh = () =>
  createGameStore(
    newGameRecord({ id: "t", puzzle: SAMPLE_EASY.puzzle, solution: SAMPLE_EASY.solution, level: "easy", createdAt: 0 }),
  );

describe("hasProgress", () => {
  it("is false for an untouched game, including pause and resume", () => {
    const store = fresh();
    store.dispatch({ type: "pause" });
    store.dispatch({ type: "resume" });
    expect(hasProgress(store.getSnapshot().record)).toBe(false);
  });

  it("is true once a digit or a note is entered, and stays true after undo", () => {
    const store = fresh();
    const empty = store.getSnapshot().board.indexOf(0);
    store.dispatch({ type: "note", cell: empty, digit: 4, on: true });
    expect(hasProgress(store.getSnapshot().record)).toBe(true);
    store.dispatch({ type: "undo" });
    expect(store.getSnapshot().record.cursor).toBe(-1);
    expect(hasProgress(store.getSnapshot().record)).toBe(true);

    const placed = fresh();
    placed.dispatch({ type: "place", cell: empty, digit: 4, input: "keyboard" });
    expect(hasProgress(placed.getSnapshot().record)).toBe(true);
  });

  it("is false for a submitted game, which is already archived", () => {
    const store = fresh();
    store.dispatch({ type: "place", cell: store.getSnapshot().board.indexOf(0), digit: 4, input: "keyboard" });
    expect(hasProgress({ ...store.getSnapshot().record, status: "submitted" })).toBe(false);
  });
});
