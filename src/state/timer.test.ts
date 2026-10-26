import { describe, expect, it } from "vitest";
import type { MetaEvent } from "./events";
import { activeMs, isPaused, isRunning } from "./timer";

type T = MetaEvent["type"];
const log = (...evs: [T, number][]) =>
  ({ log: evs.map(([type, at]) => ({ type, at }) as MetaEvent) });

describe("activeMs", () => {
  it("is 0 before start", () => {
    expect(activeMs(log(), 1000)).toBe(0);
  });
  it("runs from start", () => {
    expect(activeMs(log(["start", 100]), 350)).toBe(250);
  });
  it("stops at pause and resumes at resume", () => {
    const l = log(["start", 0], ["pause", 100], ["resume", 500]);
    expect(activeMs(log(["start", 0], ["pause", 100]), 900)).toBe(100);
    expect(activeMs(l, 600)).toBe(200);
  });
  it("handles repeated pauses and resumes", () => {
    const l = log(["start", 0], ["pause", 100], ["pause", 200], ["resume", 300], ["resume", 350]);
    expect(activeMs(l, 400)).toBe(200);
    expect(activeMs(log(["start", 0], ["pause", 100], ["pause", 200]), 999)).toBe(100);
  });
  it("hidden stops and visible resumes", () => {
    const l = log(["start", 0], ["hidden", 100], ["visible", 400]);
    expect(activeMs(l, 450)).toBe(150);
    expect(activeMs(log(["start", 0], ["hidden", 100], ["hidden", 200]), 900)).toBe(100);
  });
  it("visible does not resume a deliberately paused game", () => {
    const l = log(["start", 0], ["pause", 100], ["hidden", 150], ["visible", 200]);
    expect(activeMs(l, 900)).toBe(100);
    expect(isRunning(l)).toBe(false);
    expect(activeMs(log(["start", 0], ["hidden", 100], ["pause", 120], ["visible", 200], ["resume", 300]), 350)).toBe(150);
  });
  it("submit stops the clock for good", () => {
    const l = log(["start", 0], ["submit", 100], ["visible", 200], ["resume", 300]);
    expect(activeMs(l, 5000)).toBe(100);
  });
  it("ignores non-timer events and never goes backwards", () => {
    expect(activeMs(log(["start", 0], ["undo", 50], ["redo", 60]), 100)).toBe(100);
    expect(activeMs(log(["start", 500], ["pause", 400]), 0)).toBe(0);
  });
  it("is monotonic in now", () => {
    const l = log(["start", 0], ["pause", 100], ["resume", 200]);
    let prev = 0;
    for (let n = 0; n < 500; n += 25) {
      const v = activeMs(l, n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("isPaused", () => {
  it("tracks pause/resume only", () => {
    expect(isPaused(log(["start", 0]))).toBe(false);
    expect(isPaused(log(["start", 0], ["pause", 1], ["hidden", 2]))).toBe(true);
    expect(isPaused(log(["start", 0], ["pause", 1], ["resume", 2]))).toBe(false);
  });
});

describe("rewind after submit", () => {
  it("restarts the clock", () => {
    const l = { log: [
      { at: 0, type: "start" },
      { at: 1000, type: "submit", result: "incorrect" },
      { at: 5000, type: "rewind", to: -1 },
    ] as MetaEvent[] };
    expect(activeMs(l, 9000)).toBe(5000);
    expect(isRunning(l)).toBe(true);
  });
});
