import { describe, expect, it } from "vitest";
import type { GameRecord, MetaEvent } from "./events";
import { todayStats } from "./today";

const at = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime();

/** A solved game that started `playMs` before it was submitted at `end`. */
function solved(end: number, playMs: number, result: "solved" | "incorrect" = "solved"): GameRecord {
  const log: MetaEvent[] = [
    { type: "start", at: end - playMs },
    { type: "submit", at: end, result },
  ];
  return { status: "submitted", log } as unknown as GameRecord;
}

describe("todayStats", () => {
  it("is empty for an empty archive", () => {
    expect(todayStats([], at(27))).toEqual({ solved: 0, totalMs: 0, bestMs: null, streak: 0 });
  });

  it("counts today's solves, total and best", () => {
    const a = [solved(at(27, 9), 60_000), solved(at(27, 10), 90_000), solved(at(26, 10), 5_000)];
    const s = todayStats(a, at(27, 15));
    expect(s).toMatchObject({ solved: 2, totalMs: 150_000, bestMs: 60_000, streak: 2 });
  });

  it("ignores abandoned and incorrect games", () => {
    const abandoned = { ...solved(at(27, 9), 1000), status: "abandoned" } as GameRecord;
    expect(todayStats([abandoned, solved(at(27, 9), 1000, "incorrect")], at(27)).solved).toBe(0);
  });

  it("rolls over at midnight", () => {
    const a = [solved(at(27, 23, 59), 60_000)];
    expect(todayStats(a, at(27, 23, 59)).solved).toBe(1);
    const next = todayStats(a, at(28, 0, 0));
    expect(next).toMatchObject({ solved: 0, totalMs: 0, bestMs: null });
    expect(next.streak).toBe(1); // still alive until the day ends
    expect(todayStats(a, at(29, 0, 1)).streak).toBe(0);
  });

  it("counts consecutive days and stops at a gap", () => {
    const a = [solved(at(27), 1), solved(at(26), 1), solved(at(25), 1), solved(at(22), 1)];
    expect(todayStats(a, at(27)).streak).toBe(3);
  });

  it("keeps yesterday's streak when nothing is solved yet today", () => {
    expect(todayStats([solved(at(26), 1), solved(at(25), 1)], at(27)).streak).toBe(2);
  });

  it("steps one day across a month boundary", () => {
    const a = [solved(new Date(2026, 9, 31, 12).getTime(), 1), solved(new Date(2026, 10, 1, 12).getTime(), 1)];
    expect(todayStats(a, new Date(2026, 10, 1, 20).getTime()).streak).toBe(2);
  });
});
