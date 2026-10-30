import { describe, expect, it } from "vitest";
import { budget, liveSnapshot, spendOverlapping, spendStartedIn, toMs, usdPerPct } from "./plan-budget.mjs";

const T = (iso) => Date.parse(iso);
const config = {
  plan_budget: {
    five_hour_pct: 60,
    seven_day_pct: 85,
    usd_per_pct_prior: { five_hour: 0.1, seven_day: 1.0 },
    readings_used: 5,
    live_max_age_minutes: 30,
  },
};
const runs = [
  { run_id: "a", start: "2026-10-28T01:00:00Z", end: "2026-10-28T01:30:00Z", usd: 1.0 },
  { run_id: "b", start: "2026-10-28T04:00:00Z", end: "2026-10-28T04:30:00Z", usd: 2.0 },
  { run_id: "c", start: "2026-10-28T05:50:00Z", end: "2026-10-28T06:20:00Z", usd: 0.5 },
];

describe("toMs", () => {
  it("reads ISO strings and Unix seconds", () => {
    expect(toMs("2026-10-28T00:00:00Z")).toBe(T("2026-10-28T00:00:00Z"));
    expect(toMs(1793145600)).toBe(1793145600000);
    expect(toMs("1793145600")).toBe(1793145600000);
    expect(toMs(undefined)).toBeNaN();
  });
});

describe("window spend", () => {
  it("counts a run straddling the window start in full when budgeting", () => {
    const start = T("2026-10-28T01:15:00Z");
    expect(spendOverlapping(runs, start, T("2026-10-28T07:00:00Z"))).toBeCloseTo(3.5);
  });
  it("leaves a straddling run out when calibrating", () => {
    const start = T("2026-10-28T01:15:00Z");
    expect(spendStartedIn(runs, start, T("2026-10-28T07:00:00Z"))).toBeCloseTo(2.5);
  });
});

describe("usdPerPct", () => {
  it("falls back to the prior without readings", () => {
    expect(usdPerPct({ window: "five_hour", readings: [], runs, prior: 0.1, count: 5 })).toEqual({
      usd_per_pct: 0.1,
      source: "prior",
      readings: 0,
    });
  });

  it("divides the Director's spend in the reading's window by its percent", () => {
    // Window 02:00-07:00 from resets_at: runs b and c, $2.5 at 25%.
    const readings = [{ at: "2026-10-28T06:30:00Z", five_hour_pct: 25, resets_at: "2026-10-28T07:00:00Z" }];
    const r = usdPerPct({ window: "five_hour", readings, runs, prior: 0.1, count: 5 });
    expect(r.usd_per_pct).toBeCloseTo(0.1);
    expect(r.source).toBe("readings");
  });

  it("uses the trailing window when resets_at is missing, and the median of recent readings", () => {
    const readings = [
      { at: "2026-10-28T06:30:00Z", five_hour_pct: 50 }, // 01:30-06:30: b + c = 2.5 -> 0.05
      { at: "2026-10-28T04:45:00Z", five_hour_pct: 10 }, // 23:45-04:45: a + b = 3.0 -> 0.3
      { at: "2026-10-28T06:00:00Z", five_hour_pct: 25 }, // 01:00-06:00: a + b + c = 3.5 -> 0.14
    ];
    const r = usdPerPct({ window: "five_hour", readings, runs, prior: 0.1, count: 5 });
    expect(r.usd_per_pct).toBeCloseTo(0.14);
    expect(r.readings).toBe(3);
  });

  it("takes a reading of one run's share as that run's dollars over its percent", () => {
    // Window spend would be b + c = 2.5; the reading says $0.25 alone used 3%.
    const readings = [{ at: "2026-10-28T06:30:00Z", five_hour_pct: 3, director_usd: 0.25 }];
    expect(usdPerPct({ window: "five_hour", readings, runs, prior: 0.1, count: 5 }).usd_per_pct).toBeCloseTo(0.25 / 3);
  });

  it("skips readings too small to divide by and windows the Director didn't use", () => {
    const readings = [
      { at: "2026-10-28T06:30:00Z", five_hour_pct: 1 },
      { at: "2026-10-27T12:00:00Z", five_hour_pct: 40 },
    ];
    expect(usdPerPct({ window: "five_hour", readings, runs, prior: 0.1, count: 5 }).source).toBe("prior");
  });
});

describe("liveSnapshot", () => {
  const now = T("2026-10-28T06:30:00Z");
  const snap = {
    five_hour: { used_percentage: 42, resets_at: T("2026-10-28T08:00:00Z") / 1000 },
    seven_day: { used_percentage: 20, resets_at: T("2026-10-30T00:00:00Z") / 1000 },
    updated_at: "2026-10-28T06:20:00Z",
  };
  it("accepts a fresh snapshot", () => expect(liveSnapshot(snap, now, 30)).toBe(snap));
  it("rejects a stale one", () => expect(liveSnapshot(snap, now + 40 * 60_000, 30)).toBeNull());
  it("rejects one whose window has reset", () => {
    expect(liveSnapshot({ ...snap, five_hour: { used_percentage: 42, resets_at: now / 1000 - 1 } }, now, 30)).toBeNull();
  });
});

describe("budget", () => {
  const now = T("2026-10-28T06:30:00Z");

  it("estimates from the Director's spend in the window plus this run", () => {
    const b = budget({ config, runs, readings: [], snapshot: null, now, since: "2026-10-28T06:25:00Z", runUsd: 0.5 });
    expect(b.mode).toBe("estimate");
    // 5 h: runs b + c + this run = $3.0 at $0.10/% = 30% of 60%.
    expect(b.five_hour.used_pct).toBe(30);
    expect(b.five_hour.remaining_pct).toBe(30);
    expect(b.five_hour.remaining_usd).toBe(3);
    expect(b.five_hour.budget_usd).toBe(6);
    // 7 d: all three runs + this run = $4.0 at $1/% = 4% of 85%.
    expect(b.seven_day.remaining_usd).toBe(81);
    expect(b.remaining_usd).toBe(3);
  });

  it("doesn't count the current run twice once it is logged", () => {
    const logged = [...runs, { run_id: "now", start: "2026-10-28T06:25:00Z", end: "2026-10-28T06:30:00Z", usd: 0.5 }];
    const b = budget({ config, runs: logged, readings: [], snapshot: null, now, since: "2026-10-28T06:25:00Z", runUsd: 0.5 });
    expect(b.five_hour.used_pct).toBe(30);
  });

  it("prefers a live reading and never reports negative room", () => {
    const snapshot = {
      five_hour: { used_percentage: 75, resets_at: T("2026-10-28T08:00:00Z") / 1000 },
      updated_at: "2026-10-28T06:25:00Z",
    };
    const b = budget({ config, runs, readings: [], snapshot, now, since: undefined, runUsd: 0 });
    expect(b.mode).toBe("live");
    expect(b.five_hour.used_from).toBe("live");
    expect(b.five_hour.remaining_pct).toBe(0);
    expect(b.seven_day.used_from).toBe("estimate");
    expect(b.remaining_usd).toBe(0);
  });
});
