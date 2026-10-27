import { describe, expect, it, vi } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import { isGameRecord } from "./events";
import { activeMs } from "./timer";
import { createGameStore, newGameRecord, submitErrors, type GameStore } from "./store";

const blank = SAMPLE_EASY.puzzle.indexOf(".");
const given = SAMPLE_EASY.puzzle.search(/[1-9]/);

function make(): GameStore {
  let t = 1000;
  return createGameStore(
    newGameRecord({
      id: "t",
      puzzle: SAMPLE_EASY.puzzle,
      solution: SAMPLE_EASY.solution,
      level: "easy",
      createdAt: 1000,
    }),
    { now: () => t++, elapsed: () => 5 },
  );
}
const place = (s: GameStore, cell = blank, digit = 4) =>
  s.dispatch({ type: "place", cell, digit, input: "keyboard" });

describe("game store", () => {
  it("starts at the starting position with a valid record", () => {
    const snap = make().getSnapshot();
    expect(isGameRecord(snap.record)).toBe(true);
    expect(snap.board.filter((v) => v === 0).length).toBe(SAMPLE_EASY.puzzle.split(".").length - 1);
    expect(snap.canUndo).toBe(false);
    expect(snap.canRedo).toBe(false);
  });

  it("dispatches place, erase, note, auto-notes, reset and hint-reveal", () => {
    const s = make();
    place(s);
    expect(s.getSnapshot().board[blank]).toBe(4);
    s.dispatch({ type: "erase", cell: blank });
    expect(s.getSnapshot().board[blank]).toBe(0);
    s.dispatch({ type: "note", cell: blank, digit: 4, on: true });
    expect(s.getSnapshot().notes[blank]).not.toBe(0);
    s.dispatch({ type: "auto-notes" });
    expect(s.getSnapshot().notes[blank]).not.toBe(0);
    s.dispatch({ type: "hint-reveal", cell: blank, digit: 4, step: "naked-single" });
    expect(s.getSnapshot().board[blank]).toBe(4);
    s.dispatch({ type: "reset" });
    expect(s.getSnapshot().board.join("")).toBe(SAMPLE_EASY.puzzle.replaceAll(".", "0"));
    const { record } = s.getSnapshot();
    expect(record.nodes.map((n) => n.type)).toEqual([
      "place", "erase", "note", "auto-notes", "hint-reveal", "reset",
    ]);
    expect(record.nodes[0]).toMatchObject({ id: 0, parent: -1, elapsed: 5 });
    expect(isGameRecord(record)).toBe(true);
  });

  it("ignores edits to givens and no-op edits without logging", () => {
    const s = make();
    place(s, given);
    s.dispatch({ type: "erase", cell: blank });
    place(s);
    place(s);
    expect(s.getSnapshot().record.nodes).toHaveLength(1);
  });

  it("logs undo, redo and rewind as meta events and moves the cursor", () => {
    const s = make();
    place(s, blank, 4);
    place(s, blank, 5);
    s.dispatch({ type: "undo" });
    expect(s.getSnapshot().board[blank]).toBe(4);
    expect(s.getSnapshot().canRedo).toBe(true);
    s.dispatch({ type: "redo" });
    expect(s.getSnapshot().board[blank]).toBe(5);
    s.dispatch({ type: "rewind", to: -1 });
    expect(s.getSnapshot().board[blank]).toBe(0);
    const { record } = s.getSnapshot();
    expect(record.log.map((e) => e.type)).toEqual(["undo", "redo", "rewind"]);
    expect(record.nodes).toHaveLength(2);
    expect(isGameRecord(record)).toBe(true);
  });

  it("does not log undo/redo that go nowhere", () => {
    const s = make();
    s.dispatch({ type: "undo" });
    s.dispatch({ type: "redo" });
    expect(s.getSnapshot().record.log).toHaveLength(0);
  });

  it("appends other meta events to the log", () => {
    const s = make();
    s.dispatch({ type: "pause" });
    expect(s.getSnapshot().record.log).toMatchObject([{ type: "pause" }]);
  });

  it("logs pause and resume as meta events that leave the board alone", () => {
    const s = make();
    const before = s.getSnapshot().board;
    s.dispatch({ type: "pause" });
    s.dispatch({ type: "resume" });
    expect(s.getSnapshot().record.log.map((e) => e.type)).toEqual(["pause", "resume"]);
    expect(s.getSnapshot().board).toEqual(before);
  });

  it("notifies subscribers once per change and stops after unsubscribe", () => {
    const s = make();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    place(s);
    expect(listener).toHaveBeenCalledTimes(1);
    place(s); // no-op
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    s.dispatch({ type: "undo" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the snapshot referentially stable until something changes", () => {
    const s = make();
    const a = s.getSnapshot();
    expect(s.getSnapshot()).toBe(a);
    place(s, given);
    expect(s.getSnapshot()).toBe(a);
    place(s);
    expect(s.getSnapshot()).not.toBe(a);
  });

  it("treats redundant notes, hints and resets as no-ops", () => {
    const s = make();
    const listener = vi.fn();
    s.subscribe(listener);
    s.dispatch({ type: "note", cell: blank, digit: 4, on: false }); // bit already clear
    s.dispatch({ type: "reset" }); // untouched board
    s.dispatch({ type: "hint-reveal", cell: given, digit: 1, step: "x" });
    expect(listener).not.toHaveBeenCalled();
    s.dispatch({ type: "note", cell: blank, digit: 4, on: true });
    s.dispatch({ type: "note", cell: blank, digit: 4, on: true }); // bit already set
    expect(listener).toHaveBeenCalledTimes(1);
    place(s);
    s.dispatch({ type: "hint-reveal", cell: blank, digit: 4, step: "x" }); // already correct
    expect(listener).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot().record.nodes.map((n) => n.type)).toEqual(["note", "place"]);
  });

  it("ignores rewind to an unknown node", () => {
    const s = make();
    place(s);
    const listener = vi.fn();
    s.subscribe(listener);
    for (const to of [5, -2, 1.5, Number.NaN]) s.dispatch({ type: "rewind", to });
    expect(listener).not.toHaveBeenCalled();
    expect(s.getSnapshot().record.log).toHaveLength(0);
  });
});

describe("store timer", () => {
  it("stamps board events with log-derived active time", () => {
    let t = 1000;
    const store = createGameStore(
      newGameRecord({ id: "t", puzzle: SAMPLE_EASY.puzzle, solution: SAMPLE_EASY.solution, level: "easy", createdAt: 0 }),
      { now: () => t },
    );
    store.dispatch({ type: "start" });
    t = 1500;
    store.dispatch({ type: "hidden" });
    t = 9000;
    store.dispatch({ type: "visible" });
    t = 9100;
    const cell = blank;
    store.dispatch({ type: "place", cell, digit: Number(SAMPLE_EASY.solution[cell]), input: "keyboard" });
    expect(store.getSnapshot().record.nodes[0]?.elapsed).toBe(600);
  });
});

describe("submit", () => {
  const solution = SAMPLE_EASY.solution;
  const blanks = [...SAMPLE_EASY.puzzle].flatMap((c, i) => (c === "." ? [i] : []));
  const fill = (s: GameStore, except = -1, wrongAt = -1) => {
    for (const i of blanks) {
      if (i === except) continue;
      const d = i === wrongAt ? (Number(solution[i]) % 9) + 1 : Number(solution[i]);
      s.dispatch({ type: "place", cell: i, digit: d, input: "keyboard" });
    }
  };
  const submits = (s: GameStore) => s.getSnapshot().record.log.filter((e) => e.type === "submit");

  it("auto-submits once when the grid becomes full and correct, stopping the timer", () => {
    const s = make();
    fill(s);
    const { record } = s.getSnapshot();
    expect(record.status).toBe("submitted");
    expect(submits(s)).toEqual([expect.objectContaining({ result: "solved" })]);
    s.dispatch({ type: "submit" });
    s.dispatch({ type: "erase", cell: blanks[0]! });
    expect(submits(s)).toHaveLength(1);
    expect(s.getSnapshot().record.nodes).toHaveLength(blanks.length);
  });

  it("does not auto-submit a full but wrong grid", () => {
    const s = make();
    fill(s, -1, blanks[0]);
    expect(s.getSnapshot().record.status).toBe("playing");
  });

  it("manual submit of an incorrect grid records incorrect and locks the game", () => {
    const s = make();
    fill(s, -1, blanks[0]);
    s.dispatch({ type: "submit" });
    expect(s.getSnapshot().record.status).toBe("submitted");
    expect(submits(s)).toEqual([expect.objectContaining({ result: "incorrect" })]);
    place(s, blanks[1]!, 1);
    expect(s.getSnapshot().record.nodes).toHaveLength(blanks.length);
  });

  it("rewind reopens a submitted game on a new branch, keeping old nodes", () => {
    const s = make();
    fill(s, -1, blanks[0]);
    s.dispatch({ type: "submit" });
    const before = s.getSnapshot().record.nodes.length;
    s.dispatch({ type: "rewind", to: -1 });
    let { record } = s.getSnapshot();
    expect(record.status).toBe("playing");
    expect(record.cursor).toBe(-1);
    expect(record.log.at(-1)).toMatchObject({ type: "rewind", to: -1 });
    place(s, blanks[0]!, Number(solution[blanks[0]!]));
    record = s.getSnapshot().record;
    expect(record.nodes).toHaveLength(before + 1);
    expect(record.nodes.at(-1)!.parent).toBe(-1);
    expect(isGameRecord(record)).toBe(true);
  });

  it("reopening by rewind removes the archived copy and resubmitting archives again", () => {
    const archived = new Map<string, unknown>();
    const persistence = {
      saveCurrent: vi.fn(),
      clearCurrent: vi.fn(),
      archive: (r: { id: string }) => void archived.set(r.id, r),
      remove: (id: string) => void archived.delete(id),
    };
    let t = 1000;
    const s = createGameStore(
      newGameRecord({
        id: "t",
        puzzle: SAMPLE_EASY.puzzle,
        solution: SAMPLE_EASY.solution,
        level: "easy",
        createdAt: 1000,
      }),
      { now: () => t++, elapsed: () => 5, persistence: persistence as never },
    );
    s.dispatch({ type: "submit" });
    expect(archived.has("t")).toBe(true);
    s.dispatch({ type: "rewind", to: -1 });
    expect(archived.has("t")).toBe(false);
    s.dispatch({ type: "submit" });
    expect(archived.has("t")).toBe(true);
  });

  it("rewind to the current node still reopens a submitted game", () => {
    const s = make();
    s.dispatch({ type: "submit" });
    s.dispatch({ type: "rewind", to: -1 });
    expect(s.getSnapshot().record.status).toBe("playing");
  });

  it("manual submit of a partial grid is incorrect", () => {
    const s = make();
    s.dispatch({ type: "submit" });
    expect(submits(s)).toEqual([expect.objectContaining({ result: "incorrect" })]);
  });

  it("counts wrong and blank cells", () => {
    const s = make();
    fill(s, blanks[1], blanks[0]);
    const snap = s.getSnapshot();
    expect(submitErrors(snap.record, snap.board)).toEqual({ wrong: 1, blank: 1 });
  });

  it("stops the timer at submit", () => {
    let t = 1000;
    const store = createGameStore(
      newGameRecord({ id: "t", puzzle: SAMPLE_EASY.puzzle, solution: SAMPLE_EASY.solution, level: "easy", createdAt: 0 }),
      { now: () => t },
    );
    store.dispatch({ type: "start" });
    t = 3000;
    store.dispatch({ type: "submit" });
    const at = (ms: number) => activeMs(store.getSnapshot().record, ms);
    expect(at(3000)).toBe(2000);
    expect(at(60000)).toBe(2000);
  });
});
