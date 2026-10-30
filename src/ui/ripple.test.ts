import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { chebyshev, rippleRings, RIPPLE_STEP_MS } from "./ripple";

describe("ripple", () => {
  it("is zero at the origin and grows by rings", () => {
    expect(chebyshev(40, 40)).toBe(0);
    expect(chebyshev(0, 80)).toBe(8);
    expect(chebyshev(0, 10)).toBe(1);
    expect(chebyshev(4, 40)).toBe(4);
  });
  it("is symmetric and bounded", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 80 }), (a, b) => {
      expect(chebyshev(a, b)).toBe(chebyshev(b, a));
      expect(chebyshev(a, b)).toBeLessThanOrEqual(8);
    }));
  });
  it("keeps the whole ripple under 1.5 s", () => {
    expect(Math.max(...rippleRings(0)) * RIPPLE_STEP_MS + 500).toBeLessThan(1500);
  });
});
