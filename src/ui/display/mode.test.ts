import { describe, expect, it } from "vitest";
import { modeFromSearch, searchForMode } from "./mode";

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
