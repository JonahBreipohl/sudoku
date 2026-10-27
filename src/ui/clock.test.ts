import { describe, expect, it } from "vitest";
import { formatClockSeconds, formatLongDate } from "./clock";

const at = new Date(2026, 9, 27, 14, 5, 9).getTime();

describe("display clock formats", () => {
  it("includes seconds", () => {
    expect(formatClockSeconds(at, "en-GB")).toBe("14:05:09");
  });
  it("writes the long date", () => {
    expect(formatLongDate(at, "en-US")).toBe("Tuesday, October 27, 2026");
  });
});
