import { describe, expect, it, vi } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { newGame, resetGame, type PuzzleSupplier, type SuppliedPuzzle } from "./newGame";
import { createGameStore, newGameRecord } from "./store";
import { isGameRecord } from "./events";

const base = { puzzle: SAMPLE_EASY.puzzle, solution: SAMPLE_EASY.solution, level: "easy" as const, score: 3 };
const supplier = (source: SuppliedPuzzle["source"]): PuzzleSupplier => ({
  nextPuzzle: async (level) => ({ ...base, id: `${source}-1`, level, source }),
});

function playedRecord() {
  let t = 1000;
  const store = createGameStore(newGameRecord({ id: "old", ...base, createdAt: 0 }), { now: () => t });
  store.dispatch({ type: "start" });
  t = 6000;
  const cell = store.getSnapshot().givens.findIndex((v) => v === 0);
  store.dispatch({ type: "place", cell, digit: 1, input: "keyboard" });
  return store.getSnapshot().record;
}

describe("newGame", () => {
  it.each(["bank", "generated", "import"] as const)("starts a %s record and archives the old one", async (source) => {
    const archive = vi.fn();
    const rec = await newGame("medium", supplier(source), {
      current: playedRecord(),
      persistence: { archive },
      now: () => 9000,
    });
    expect(rec).toMatchObject({ id: `${source}-1`, source, level: "medium", status: "playing", createdAt: 9000 });
    expect(archive).toHaveBeenCalledTimes(1);
    const old = archive.mock.calls[0]![0];
    expect(old).toMatchObject({ id: "old", status: "abandoned", activeMs: 8000 });
    expect(isGameRecord(old)).toBe(true);
  });

  it("does not archive an untouched or submitted game", async () => {
    const archive = vi.fn();
    const fresh = newGameRecord({ id: "f", ...base, createdAt: 0 });
    await newGame("easy", supplier("bank"), { current: fresh, persistence: { archive } });
    await newGame("easy", supplier("bank"), {
      current: { ...playedRecord(), status: "submitted" },
      persistence: { archive },
    });
    expect(archive).not.toHaveBeenCalled();
  });

  it("keeps the old game when the source fails", async () => {
    const archive = vi.fn();
    const bad: PuzzleSupplier = { nextPuzzle: () => Promise.reject(new Error("no")) };
    await expect(newGame("easy", bad, { current: playedRecord(), persistence: { archive } })).rejects.toThrow();
    expect(archive).not.toHaveBeenCalled();
  });
});

describe("resetGame", () => {
  it("dispatches reset, clearing player entries", () => {
    const store = createGameStore(newGameRecord({ id: "r", ...base, createdAt: 0 }));
    const cell = store.getSnapshot().givens.findIndex((v) => v === 0);
    store.dispatch({ type: "place", cell, digit: 1, input: "keyboard" });
    resetGame(store);
    expect(store.getSnapshot().board[cell]).toBe(0);
    expect(store.getSnapshot().record.nodes.at(-1)?.type).toBe("reset");
  });
});
