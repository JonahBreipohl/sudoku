import { describe, expect, it } from "vitest";
import type { BoardEvent } from "../state/events";
import { clampStep, mistakeStep, stepLabel } from "./timeline";

const path = [
  { id: 0, parent: -1, at: 0, elapsed: 0, type: "place", cell: 28, digit: 6, input: "keyboard" },
  { id: 1, parent: 0, at: 1, elapsed: 1, type: "erase", cell: 28 },
] as BoardEvent[];

describe("timeline", () => {
  it("labels steps by move number and event", () => {
    expect(stepLabel(path, 1)).toBe("Move 1 of 2: r4c2 = 6");
    expect(stepLabel(path, 2)).toBe("Move 2 of 2: r4c2 erased");
    expect(stepLabel(path, 0)).toMatch(/^Starting position/);
  });
  it("clamps steps into range", () => {
    expect(clampStep(-3, 2)).toBe(0);
    expect(clampStep(9, 2)).toBe(2);
    expect(stepLabel(path, 99)).toBe(stepLabel(path, 2));
  });
  it("maps the root mistake index to the step showing it", () => {
    expect(mistakeStep(0, 2)).toBe(1);
    expect(mistakeStep(null, 2)).toBeNull();
    expect(mistakeStep(5, 2)).toBeNull();
  });
});
