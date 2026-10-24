import { describe, expect, it } from "vitest";
import { CancelledError, createEngineClient } from "./client";

const EMPTY = Array<number>(81).fill(0) as never;
const CONFLICT = [1, 1, ...Array<number>(79).fill(0)] as never;

describe("engine client (in-thread)", () => {
  it("solves and counts", async () => {
    const c = createEngineClient({ inThread: true });
    const s = await c.solve(EMPTY);
    expect(s).toHaveLength(81);
    expect(await c.countSolutions(EMPTY, 3)).toBe(3);
    expect(await c.countSolutions(CONFLICT)).toBe(0);
    expect(await c.solve(CONFLICT)).toBeNull();
  });

  it("matches concurrent responses to requests", async () => {
    const c = createEngineClient({ inThread: true });
    const [a, b] = await Promise.all([c.countSolutions(EMPTY, 2), c.countSolutions(EMPTY, 5)]);
    expect([a, b]).toEqual([2, 5]);
  });

  it("propagates errors as rejections", async () => {
    const c = createEngineClient({ inThread: true });
    await expect(c.countSolutions(EMPTY, 0)).rejects.toThrow(/positive integer/);
  });

  it("cancel rejects pending calls and later calls still work", async () => {
    const c = createEngineClient({ inThread: true });
    const p = c.solve(EMPTY);
    c.cancel();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(await c.countSolutions(EMPTY, 2)).toBe(2);
  });
});
