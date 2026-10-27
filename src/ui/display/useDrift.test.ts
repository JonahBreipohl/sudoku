import { describe, expect, it } from "vitest";
import { DRIFT_STEP_MS, driftOffset, isNight } from "./useDrift";

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m, 0).getTime();

describe("isNight", () => {
  it("covers 22:00 to 07:00 local", () => {
    expect(isNight(at(21, 59))).toBe(false);
    expect(isNight(at(22))).toBe(true);
    expect(isNight(at(0))).toBe(true);
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7))).toBe(false);
    expect(isNight(at(12))).toBe(false);
  });
});

describe("driftOffset", () => {
  it("is stable within a slot and changes at the boundary", () => {
    const t0 = Math.floor(at(10) / DRIFT_STEP_MS) * DRIFT_STEP_MS;
    expect(driftOffset(t0 + 1)).toEqual(driftOffset(t0 + DRIFT_STEP_MS - 1));
    expect(driftOffset(t0 + DRIFT_STEP_MS)).not.toEqual(driftOffset(t0));
  });
  it("stays within a few pixels and handles negative times", () => {
    for (let i = -20; i < 200; i++) {
      const { dx, dy } = driftOffset(i * DRIFT_STEP_MS);
      expect(Math.abs(dx)).toBeLessThanOrEqual(6);
      expect(Math.abs(dy)).toBeLessThanOrEqual(6);
    }
  });
});
