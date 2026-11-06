import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { GUST_MS, MAX_PETALS, STORM_MS, burstMs, petalPose, planGust, planStorm } from "./gusts";

const phone = { w: 390, h: 844 };
const desk = { w: 1440, h: 900 };
const deskBoard = { x: 423, y: 52, w: 594, h: 594 };

describe("planGust", () => {
  it("is reproducible for a seed", () => {
    const unit = { x: 423, y: 52, w: 594, h: 66 };
    expect(planGust(unit, deskBoard, desk, 3)).toEqual(planGust(unit, deskBoard, desk, 3));
  });

  it("starts every petal inside the completed unit", () => {
    const unit = { x: 489, y: 52, w: 66, h: 594 };
    for (const p of planGust(unit, deskBoard, desk, 9)) {
      expect(p.x0).toBeGreaterThanOrEqual(unit.x);
      expect(p.x0).toBeLessThanOrEqual(unit.x + unit.w);
      expect(p.y0).toBeGreaterThanOrEqual(unit.y);
      expect(p.y0).toBeLessThanOrEqual(unit.y + unit.h);
    }
  });

  it("leaves a bottom row downward on a phone, where the free band is", () => {
    const board = { x: 16, y: 44, w: 358, h: 358 };
    const unit = { x: 16, y: 362, w: 358, h: 40 };
    const ps = planGust(unit, board, phone, 1);
    const down = ps.filter((p) => p.vy > 0).length;
    expect(down / ps.length).toBeGreaterThan(0.8);
  });

  it("every petal is gone by the end of the gust", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.integer({ min: 0, max: 8 }), (seed, row) => {
        const unit = { x: 423, y: 52 + row * 66, w: 594, h: 66 };
        const ps = planGust(unit, deskBoard, desk, seed);
        expect(ps.length).toBeLessThanOrEqual(MAX_PETALS);
        for (const p of ps) {
          expect(p.delay + p.life).toBeLessThanOrEqual(GUST_MS / 1000);
          expect(petalPose(p, GUST_MS / 1000)).toBeNull();
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("planStorm", () => {
  it("fits the instanced capacity and settles by the end", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.integer({ min: 320, max: 3840 }), fc.integer({ min: 480, max: 2160 }), (seed, w, h) => {
        const ps = planStorm([[100, 100], [200, 160]], { w, h }, seed);
        expect(ps.length).toBeLessThanOrEqual(MAX_PETALS);
        expect(ps.length).toBeGreaterThan(0);
        for (const p of ps) expect(petalPose(p, STORM_MS / 1000)).toBeNull();
      }),
      { numRuns: 60 },
    );
  });

  it("works with no blossom sources (fallback composition)", () => {
    expect(planStorm([], desk, 2).length).toBeGreaterThan(50);
  });
});

describe("petalPose", () => {
  const [p] = planGust({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 100, h: 100 }, desk, 5);

  it("is hidden before its delay and starts at its spawn point", () => {
    if (!p) throw new Error("no petal");
    if (p.delay > 0) expect(petalPose(p, p.delay - 0.001)).toBeNull();
    const start = petalPose(p, p.delay);
    expect(start).not.toBeNull();
    expect(start!.x).toBeCloseTo(p.x0, 6);
    expect(start!.y).toBeCloseTo(p.y0, 6);
    expect(start!.alpha).toBe(0);
  });

  it("keeps opacity within 0..1, fully opaque mid-flight", () => {
    if (!p) throw new Error("no petal");
    for (let t = 0; t < 3; t += 0.05) {
      const pose = petalPose(p, t);
      if (pose) {
        expect(pose.alpha).toBeGreaterThanOrEqual(0);
        expect(pose.alpha).toBeLessThanOrEqual(1);
      }
    }
    expect(petalPose(p, p.delay + p.life * 0.4)!.alpha).toBe(1);
  });

  it("falls over time once the push has died away", () => {
    if (!p) throw new Error("no petal");
    const a = petalPose(p, p.delay + p.life * 0.7)!;
    const b = petalPose(p, p.delay + p.life * 0.9)!;
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("burstMs matches the brief: a short gust and a longer storm", () => {
    expect(burstMs("gust")).toBe(2500);
    expect(burstMs("storm")).toBe(4000);
  });
});
