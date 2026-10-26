import { describe, expect, it } from "vitest";
import { SAMPLE_EASY } from "../engine/samples";
import {
  ARCHIVE_CAP,
  KEYS,
  createLocalStoragePersistence,
  type KeyValueStorage,
} from "./persistence";
import { createGameStore, newGameRecord } from "./store";

function fakeStorage(opts: { failWrites?: boolean; failAll?: boolean } = {}) {
  const data = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem(k) {
      if (opts.failAll) throw new Error("blocked");
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      if (opts.failAll || opts.failWrites) throw new Error("quota");
      data.set(k, v);
    },
    removeItem(k) {
      if (opts.failAll) throw new Error("blocked");
      data.delete(k);
    },
  };
  return { data, storage };
}

const rec = (id: string) =>
  newGameRecord({
    id,
    puzzle: SAMPLE_EASY.puzzle,
    solution: SAMPLE_EASY.solution,
    level: "easy",
    createdAt: 1,
  });
const make = (f = fakeStorage()) => ({ ...f, p: createLocalStoragePersistence(() => f.storage, () => 42) });

describe("localStorage persistence", () => {
  it("round-trips the current game and settings", () => {
    const { p } = make();
    expect(p.loadCurrent()).toBeNull();
    p.saveCurrent(rec("a"));
    expect(p.loadCurrent()).toEqual(rec("a"));
    p.saveSettings({ theme: "dark" });
    expect(p.loadSettings()).toEqual({ theme: "dark" });
    p.clearCurrent();
    expect(p.loadCurrent()).toBeNull();
  });

  it("caps the archive at 500, dropping the oldest, and replaces by id", () => {
    const { p } = make();
    for (let i = 0; i < ARCHIVE_CAP + 3; i++) p.archive(rec(`g${i}`));
    const ids = p.list().map((r) => r.id);
    expect(ids).toHaveLength(ARCHIVE_CAP);
    expect(ids[0]).toBe("g3");
    p.archive(rec("g10"));
    expect(p.list().filter((r) => r.id === "g10")).toHaveLength(1);
    expect(p.list().at(-1)?.id).toBe("g10");
    p.remove("g10");
    expect(p.list().some((r) => r.id === "g10")).toBe(false);
  });

  it("moves corrupt or wrong-version data aside and starts clean", () => {
    const { p, data } = make();
    data.set(KEYS.current, "{not json");
    expect(p.loadCurrent()).toBeNull();
    expect(data.has(KEYS.current)).toBe(false);
    expect(data.get("sudoku:corrupt:v1:current:42")).toBe("{not json");

    data.set(KEYS.current, JSON.stringify({ ...rec("a"), version: 2 }));
    expect(p.loadCurrent()).toBeNull();
    expect(data.has(KEYS.current)).toBe(false);

    data.set(KEYS.archive, JSON.stringify([{ nope: 1 }]));
    expect(p.list()).toEqual([]);
    data.set(KEYS.settings, "[]");
    expect(p.loadSettings()).toBeNull();
    expect([...data.keys()].filter((k) => k.startsWith("sudoku:corrupt:"))).toHaveLength(3);
  });

  it("never throws when storage fails", () => {
    for (const opts of [{ failWrites: true }, { failAll: true }]) {
      const { p } = make(fakeStorage(opts));
      expect(() => {
        p.saveCurrent(rec("a"));
        p.archive(rec("a"));
        p.remove("a");
        p.clearCurrent();
        p.saveSettings({});
        p.loadCurrent();
        p.list();
        p.loadSettings();
      }).not.toThrow();
    }
    const unavailable = createLocalStoragePersistence(() => {
      throw new Error("denied");
    });
    expect(unavailable.loadCurrent()).toBeNull();
  });
});

describe("store autosave", () => {
  it("saves after every event and resumes from the saved record", () => {
    const { p } = make();
    const first = createGameStore(rec("a"), { persistence: p, now: () => 5, elapsed: () => 1 });
    const blank = SAMPLE_EASY.puzzle.indexOf(".");
    first.dispatch({ type: "place", cell: blank, digit: 4, input: "keyboard" });
    first.dispatch({ type: "pause" });
    const saved = p.loadCurrent();
    expect(saved).toEqual(first.getSnapshot().record);
    const resumed = createGameStore(saved!, { persistence: p });
    expect(resumed.getSnapshot().board[blank]).toBe(4);
    expect(resumed.getSnapshot().record.log.map((e) => e.type)).toEqual(["pause"]);
  });

  it("keeps playing when saves fail", () => {
    const { p } = make(fakeStorage({ failAll: true }));
    const s = createGameStore(rec("a"), { persistence: p });
    const blank = SAMPLE_EASY.puzzle.indexOf(".");
    s.dispatch({ type: "place", cell: blank, digit: 4, input: "keyboard" });
    expect(s.getSnapshot().board[blank]).toBe(4);
  });

  it("archives and clears a submitted game", () => {
    const { p } = make();
    const s = createGameStore(rec("a"), { persistence: p });
    s.dispatch({ type: "submit" });
    expect(p.loadCurrent()).toBeNull();
    expect(p.list().map((r) => r.id)).toEqual(["a"]);
  });
});
