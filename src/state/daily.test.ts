import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../engine/step";
import type { GameRecord } from "./events";
import { dailyLevel, dailyPuzzle, dailySolvedOn, dailyStats, dateKey, hashString } from "./daily";
import { levelStats } from "./stats";

const fetchBank = async (url: string) => {
  const level = /([a-z]+)\.json$/.exec(url)![1]!;
  const text = readFileSync(`public/puzzles/${level}.json`, "utf8");
  return { ok: true, json: async () => JSON.parse(text) as unknown };
};
// Local-time constructors: the same wall-clock date in whatever zone the suite runs in.
const local = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m);

describe("dailyLevel", () => {
  it("follows the weekday rotation", () => {
    // 2026-10-26 is a Monday.
    const got = [26, 27, 28, 29, 30, 31, 25].map((d) => dailyLevel(local(d)));
    expect(got).toEqual(["easy", "medium", "medium", "hard", "hard", "expert", "master"]);
    for (const l of got) expect(LEVELS).toContain(l);
  });
});

describe("dateKey", () => {
  it("uses the local calendar date, not UTC", () => {
    expect(dateKey(local(28, 0, 1))).toBe("2026-10-28");
    expect(dateKey(local(28, 23, 59))).toBe("2026-10-28");
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("dailyPuzzle", () => {
  const opts = { fetch: fetchBank };
  it("gives the same puzzle for any time on the same local date", async () => {
    const a = await dailyPuzzle(local(28, 0, 1), opts);
    const b = await dailyPuzzle(local(28, 23, 59), opts);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ id: "daily-2026-10-28", source: "daily", level: "medium" });
  });
  it("varies across dates and spreads over the bank", async () => {
    const sols = new Set<string>();
    for (let d = 1; d <= 28; d += 7) sols.add((await dailyPuzzle(local(d), opts)).solution);
    expect(sols.size).toBeGreaterThan(1);
  });
  it("rejects when the bank is unavailable", async () => {
    await expect(dailyPuzzle(local(28), { fetch: async () => ({ ok: false, json: async () => ({}) }) })).rejects.toThrow();
  });
});

describe("hashString", () => {
  it("is stable", () => {
    expect(hashString("2026-10-28:medium")).toBe(hashString("2026-10-28:medium"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

function game(source: "daily" | "bank", end: number): GameRecord {
  return {
    source,
    level: "easy",
    status: "submitted",
    log: [
      { type: "start", at: end - 60_000 },
      { type: "submit", at: end, result: "solved" },
    ],
  } as unknown as GameRecord;
}

describe("dailyStats", () => {
  it("counts only daily games and their consecutive days", () => {
    const a = [game("daily", local(28).getTime()), game("daily", local(27).getTime()), game("bank", local(26).getTime())];
    expect(dailyStats(a, local(28).getTime())).toEqual({ solved: 2, streak: 2 });
  });
  it("keeps yesterday's streak until today is missed, then resets", () => {
    const a = [game("daily", local(27).getTime())];
    expect(dailyStats(a, local(28).getTime()).streak).toBe(1);
    expect(dailyStats(a, local(29).getTime()).streak).toBe(0);
  });
  it("keeps daily games out of per-level stats", () => {
    const a = [game("daily", local(28).getTime())];
    expect(levelStats(a, local(28).getTime()).every((s) => s.solved === 0)).toBe(true);
  });
});

describe("daily played marking and solved state", () => {
  it("marks the picked bank id as played", async () => {
    const added: string[] = [];
    const p = await dailyPuzzle(local(28), { fetch: fetchBank, played: { add: (id) => added.push(id) } });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^m-/);
    expect(added[0]).not.toBe(p.id);
  });

  it("detects a solved daily for the date, ignoring other days and unsolved records", () => {
    const d = local(28);
    const solved = { ...game("daily", d.getTime()), id: "daily-2026-10-28" } as GameRecord;
    expect(dailySolvedOn(d, [solved])).toBe(true);
    expect(dailySolvedOn(local(29), [solved])).toBe(false);
    expect(dailySolvedOn(d, [{ ...solved, status: "abandoned", log: [] } as GameRecord])).toBe(false);
    expect(dailySolvedOn(d, [undefined])).toBe(false);
  });
});
