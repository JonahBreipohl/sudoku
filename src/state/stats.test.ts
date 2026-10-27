import { describe, expect, it } from "vitest";
import type { Level } from "../engine";
import type { GameRecord, MetaEvent } from "./events";
import { hadMistake, levelStats } from "./stats";

const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime();

function game(
  level: Level,
  end: number,
  playMs: number,
  extra: MetaEvent[] = [],
): GameRecord {
  const log: MetaEvent[] = [
    { type: "start", at: end - playMs },
    ...extra,
    { type: "submit", at: end, result: "solved" },
  ];
  return { level, status: "submitted", log } as unknown as GameRecord;
}
const find = (a: GameRecord[], level: Level, now = at(27)) =>
  levelStats(a, now).find((s) => s.level === level)!;

describe("levelStats", () => {
  it("is empty per level for an empty archive", () => {
    for (const s of levelStats([], at(27))) {
      expect(s).toMatchObject({
        solved: 0,
        bestMs: null,
        averageMs: null,
        streak: 0,
        mistakeRate: null,
      });
    }
  });

  it("separates levels and computes best and average", () => {
    const a = [
      game("easy", at(27), 60_000),
      game("easy", at(26), 120_000),
      game("hard", at(27), 500_000),
    ];
    expect(find(a, "easy")).toMatchObject({
      solved: 2,
      bestMs: 60_000,
      averageMs: 90_000,
    });
    expect(find(a, "hard")).toMatchObject({ solved: 1, bestMs: 500_000 });
    expect(find(a, "medium").solved).toBe(0);
  });

  it("ignores abandoned and incorrect games", () => {
    const ab = {
      ...game("easy", at(27), 1000),
      status: "abandoned",
    } as GameRecord;
    const bad = {
      ...game("easy", at(27), 1000),
      log: [{ type: "submit", at: at(27), result: "incorrect" }],
    } as GameRecord;
    expect(find([ab, bad], "easy").solved).toBe(0);
  });

  it("counts a game with any mistake once, however many checks", () => {
    const m: MetaEvent[] = [
      { type: "check", at: at(27), mistakes: 2 },
      { type: "check", at: at(27), mistakes: 1 },
    ];
    const a = [
      game("easy", at(27), 1000, m),
      game("easy", at(26), 1000),
      game("easy", at(25), 1000, [{ type: "check", at: at(25), mistakes: 0 }]),
    ];
    expect(find(a, "easy")).toMatchObject({
      mistakeGames: 1,
      mistakeRate: 1 / 3,
    });
  });

  it("treats a prior incorrect submit as a mistake", () => {
    expect(
      hadMistake(
        game("easy", at(27), 1, [
          { type: "submit", at: at(27), result: "incorrect" },
        ]),
      ),
    ).toBe(true);
  });

  it("streaks run across consecutive days, per level", () => {
    const a = [
      game("easy", at(27), 1),
      game("easy", at(26, 1), 1),
      game("easy", at(25, 23), 1),
      game("easy", at(23), 1),
      game("hard", at(24), 1),
    ];
    expect(find(a, "easy").streak).toBe(3);
    expect(find(a, "hard").streak).toBe(0);
  });

  it("keeps a streak alive until the day ends, then drops it", () => {
    const a = [game("easy", at(26), 1), game("easy", at(25), 1)];
    expect(find(a, "easy", at(27)).streak).toBe(2);
    expect(find(a, "easy", at(28)).streak).toBe(0);
  });

  it("counts two solves on one day once for the streak", () => {
    const a = [game("easy", at(27, 9), 1), game("easy", at(27, 10), 1)];
    expect(find(a, "easy").streak).toBe(1);
  });
});
