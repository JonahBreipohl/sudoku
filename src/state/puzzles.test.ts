import { describe, expect, it, vi } from "vitest";
import { serializeBank } from "../engine/bank";
import { createPlayedStore, createPuzzleSource, type PlayedStore } from "./puzzles";

const SOL = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const mk = (n: number, puzzle: string) => ({ id: `e-00000${n}`, puzzle, solution: SOL, score: n * 10, hardest: null });
// Distinct valid-shaped puzzles: blank a different cell each time.
const P = (i: number) => SOL.slice(0, i) + "0" + SOL.slice(i + 1);
const bank = { version: 1 as const, level: "easy" as const, generated: "2026-10-25", puzzles: [mk(1, P(0)), mk(2, P(1))] };

const memStore = (): PlayedStore => {
  const s = new Set<string>();
  return { has: (id) => s.has(id), add: (id) => void s.add(id) };
};
const okFetch = (json: unknown) => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(json) }));
const gen = () => ({ generate: vi.fn(() => Promise.resolve({ puzzle: P(5), solution: SOL, score: 77 })) });

describe("puzzle source", () => {
  it("hands out bank puzzles in score order, then generates", async () => {
    const fetch = okFetch(JSON.parse(serializeBank(bank)));
    const generator = gen();
    const src = createPuzzleSource({ fetch, generator, played: memStore(), seed: () => "s" });
    expect((await src.nextPuzzle("easy")).id).toBe("e-000001");
    const second = await src.nextPuzzle("easy");
    expect([second.id, second.source]).toEqual(["e-000002", "bank"]);
    expect(generator.generate).not.toHaveBeenCalled();
    const third = await src.nextPuzzle("easy");
    expect(third.source).toBe("generated");
    expect(generator.generate).toHaveBeenCalledWith("easy", "s");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips ids already in the played store", async () => {
    const played = memStore();
    played.add("e-000001");
    const src = createPuzzleSource({ fetch: okFetch(bank), generator: gen(), played });
    expect((await src.nextPuzzle("easy")).id).toBe("e-000002");
  });

  it("falls back to generation when fetch rejects, not ok, or the bank is invalid", async () => {
    const cases = [
      vi.fn(() => Promise.reject(new Error("offline"))),
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })),
      okFetch({ nonsense: true }),
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error("bad json")) })),
    ];
    for (const fetch of cases) {
      const src = createPuzzleSource({ fetch, generator: gen(), played: memStore() });
      expect((await src.nextPuzzle("easy")).source).toBe("generated");
    }
  });
});

describe("played store", () => {
  it("persists ids and survives broken storage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    createPlayedStore(storage).add("e-000001");
    expect(createPlayedStore(storage).has("e-000001")).toBe(true);
    const broken = { getItem: () => "{oops", setItem: () => { throw new Error("quota"); } };
    const s = createPlayedStore(broken);
    s.add("x");
    expect(s.has("x")).toBe(true);
  });
});
