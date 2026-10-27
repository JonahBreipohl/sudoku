import { describe, expect, it } from "vitest";
import { DEFAULT_STEP_MS, pickWatchPuzzle, watchParams } from "./watch";

describe("watchParams", () => {
  it("defaults to 6 s and off", () => {
    expect(watchParams("?mode=display")).toEqual({ enabled: false, seed: null, stepMs: DEFAULT_STEP_MS });
    expect(DEFAULT_STEP_MS).toBe(6000);
  });
  it("reads watch, seed and interval, clamping the interval", () => {
    expect(watchParams("?watch&seed=abc&interval=2")).toEqual({ enabled: true, seed: "abc", stepMs: 2000 });
    expect(watchParams("?watch&interval=0.01").stepMs).toBe(1000);
    expect(watchParams("?watch&interval=9999").stepMs).toBe(60000);
    expect(watchParams("?watch&interval=junk").stepMs).toBe(DEFAULT_STEP_MS);
  });
});

describe("pickWatchPuzzle", () => {
  const counts = () => 50;
  it("is deterministic per seed and puzzle number", () => {
    expect(pickWatchPuzzle("s", 0, counts)).toEqual(pickWatchPuzzle("s", 0, counts));
    const picks = new Set(Array.from({ length: 20 }, (_, n) => JSON.stringify(pickWatchPuzzle("s", n, counts))));
    expect(picks.size).toBeGreaterThan(1);
  });
  it("stays within the bank", () => {
    for (let n = 0; n < 30; n++) expect(pickWatchPuzzle("x", n, () => 3).index).toBeLessThan(3);
  });
});
