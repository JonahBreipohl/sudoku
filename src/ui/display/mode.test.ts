import { describe, expect, it, vi } from "vitest";
import { modeFromSearch, pauseForDisplay, searchForMode } from "./mode";

describe("mode param", () => {
  it("reads display only when asked", () => {
    expect(modeFromSearch("?mode=display")).toBe("display");
    expect(modeFromSearch("")).toBe("play");
    expect(modeFromSearch("?mode=other")).toBe("play");
  });
  it("round-trips and keeps other params", () => {
    expect(searchForMode("?test=1", "display")).toBe("?test=1&mode=display");
    expect(searchForMode("?test=1&mode=display", "play")).toBe("?test=1");
    expect(searchForMode("?mode=display", "play")).toBe("");
  });
});

describe("pauseForDisplay", () => {
  const mk = (status: string, paused: boolean) => {
    const dispatch = vi.fn();
    const record = { status, log: paused ? [{ type: "pause", at: 0 }] : [] };
    return { dispatch, getSnapshot: () => ({ record }) as never };
  };
  it("pauses a running game", () => {
    const s = mk("playing", false);
    pauseForDisplay(s);
    expect(s.dispatch).toHaveBeenCalledWith({ type: "pause" });
  });
  it("does nothing when paused or submitted", () => {
    for (const s of [mk("playing", true), mk("submitted", false)]) {
      pauseForDisplay(s);
      expect(s.dispatch).not.toHaveBeenCalled();
    }
  });
});
