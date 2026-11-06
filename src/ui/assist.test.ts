import { describe, expect, it } from "vitest";
import { assistView } from "./assist";

describe("assistView", () => {
  it("adds help as the level gets easier", () => {
    expect(assistView("hard")).toEqual({ hints: false, liveWrong: false, conflicts: false });
    expect(assistView("medium")).toEqual({ hints: false, liveWrong: true, conflicts: true });
    expect(assistView("easy")).toEqual({ hints: true, liveWrong: true, conflicts: true });
  });
});
