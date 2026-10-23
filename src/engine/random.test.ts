import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "./random";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    for (const seed of [0, 1, 42, "hello", ""]) {
      const a = createRng(seed);
      const b = createRng(seed);
      const xs = Array.from({ length: 50 }, () => a.next());
      const ys = Array.from({ length: 50 }, () => b.next());
      expect(xs).toEqual(ys);
    }
  });

  it("differs across seeds", () => {
    const a = createRng("a").next();
    expect(createRng("b").next()).not.toBe(a);
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("hashes numbers through their decimal string", () => {
    expect(createRng(42).next()).toBe(createRng("42").next());
  });

  it("next() stays in [0, 1)", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string()), (seed) => {
        const r = createRng(seed);
        for (let i = 0; i < 100; i++) {
          const x = r.next();
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });

  it("int(n) stays in range", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (seed, n) => {
        const r = createRng(seed);
        for (let i = 0; i < 50; i++) {
          const x = r.int(n);
          expect(Number.isInteger(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(n);
        }
      }),
    );
  });

  it("int rejects invalid bounds", () => {
    const r = createRng(1);
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(1.5)).toThrow(RangeError);
    expect(r.int(1)).toBe(0);
  });

  it("shuffle is a permutation and does not mutate its input", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.integer(), { maxLength: 40 }), (seed, arr) => {
        const copy = arr.slice();
        const out = createRng(seed).shuffle(arr);
        expect(arr).toEqual(copy);
        expect(out).not.toBe(arr);
        expect([...out].sort((x, y) => x - y)).toEqual([...arr].sort((x, y) => x - y));
      }),
    );
  });

  it("shuffle is deterministic per seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(createRng("s").shuffle(items)).toEqual(createRng("s").shuffle(items));
  });

  it("10k draws are roughly uniform (chi-square sanity)", () => {
    const bins = 10;
    const draws = 10000;
    const counts = new Array<number>(bins).fill(0);
    const r = createRng("chi-square");
    for (let i = 0; i < draws; i++) {
      const k = Math.floor(r.next() * bins);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const expected = draws / bins;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: 99.9th percentile is about 27.9.
    expect(chi2).toBeLessThan(27.9);

    const ints = new Array<number>(bins).fill(0);
    const r2 = createRng(7);
    for (let i = 0; i < draws; i++) {
      const k = r2.int(bins);
      ints[k] = (ints[k] ?? 0) + 1;
    }
    const chi2Int = ints.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi2Int).toBeLessThan(27.9);
  });
});
