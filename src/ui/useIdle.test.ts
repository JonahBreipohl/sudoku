import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchIdle } from "./useIdle";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("watchIdle", () => {
  it("fires once after the idle period", () => {
    const fn = vi.fn();
    watchIdle(2, fn, new EventTarget());
    vi.advanceTimersByTime(119_000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("input postpones it", () => {
    const fn = vi.fn();
    const target = new EventTarget();
    watchIdle(1, fn, target);
    vi.advanceTimersByTime(50_000);
    target.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(50_000);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stop cancels it and detaches listeners", () => {
    const fn = vi.fn();
    const target = new EventTarget();
    const stop = watchIdle(1, fn, target);
    stop();
    vi.advanceTimersByTime(3_600_000);
    expect(fn).not.toHaveBeenCalled();
  });
});
