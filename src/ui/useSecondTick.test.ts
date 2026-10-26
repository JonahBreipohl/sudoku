import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { msToNextSecond, startSecondTicker } from "./useSecondTick";

describe("msToNextSecond", () => {
  it("lands just after the next second boundary", () => {
    expect(msToNextSecond(10_000)).toBe(1005);
    expect(msToNextSecond(10_250)).toBe(755);
    expect(msToNextSecond(10_999)).toBe(6);
  });
});

describe("startSecondTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_250));
  });
  afterEach(() => vi.useRealTimers());

  it("ticks immediately, then only just after each second boundary", () => {
    const seen: number[] = [];
    startSecondTicker((t) => seen.push(t));
    expect(seen).toEqual([1_000_000_250]);
    vi.advanceTimersByTime(754);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(seen).toHaveLength(2);
    vi.advanceTimersByTime(3000);
    expect(seen).toHaveLength(5);
    expect(seen.slice(1).every((t) => t % 1000 === 5)).toBe(true);
  });

  it("uses a single pending timeout and stops cleanly", () => {
    const stop = startSecondTicker(() => {});
    vi.advanceTimersByTime(2500);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
