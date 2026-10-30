import { describe, expect, it, vi } from "vitest";
import { haptic, HAPTIC_PATTERNS, type HapticEvent } from "./haptics";

const make = (coarse = true) => {
  const vibrate = vi.fn(() => true);
  return { vibrate, env: { vibrate, coarsePointer: () => coarse } };
};

describe("haptic", () => {
  it("sends the pattern for each event", () => {
    for (const e of Object.keys(HAPTIC_PATTERNS) as HapticEvent[]) {
      const { vibrate, env } = make();
      expect(haptic(e, true, env)).toBe(true);
      expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS[e]);
    }
    expect(HAPTIC_PATTERNS.place).toBe(8);
    expect(HAPTIC_PATTERNS.conflict).toEqual([15, 40, 15]);
  });
  it("is a no-op when the setting is off", () => {
    const { vibrate, env } = make();
    expect(haptic("place", false, env)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("is a no-op for fine pointers", () => {
    const { vibrate, env } = make(false);
    expect(haptic("solve", true, env)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("is a silent no-op when vibrate is unsupported or throws", () => {
    expect(haptic("place", true, { coarsePointer: () => true })).toBe(false);
    const env = { vibrate: () => { throw new Error("blocked"); }, coarsePointer: () => true };
    expect(haptic("place", true, env)).toBe(false);
  });
});
