// Per-level stats from the archive (docs/ARCHITECTURE.md, "Persistence"). Pure: the caller
// supplies `now` so the streak (which depends on today) is testable.

import { LEVELS, type Level } from "../engine";
import type { GameRecord } from "./events";
import { dayIndex, solvedAt } from "./today";
import { activeMs } from "./timer";

export interface LevelStats {
  level: Level;
  /** Games submitted correctly. */
  solved: number;
  bestMs: number | null;
  averageMs: number | null;
  /** Consecutive local days ending today (or yesterday if none yet today) with a solve here. */
  streak: number;
  /** Solved games where any mistake was seen. */
  mistakeGames: number;
  /** mistakeGames / solved, 0..1; null when nothing is solved. */
  mistakeRate: number | null;
}

/** A game had a mistake if a check found one or an incorrect submit preceded the solve. */
export function hadMistake(r: GameRecord): boolean {
  return r.log.some(
    (e) =>
      (e.type === "check" && e.mistakes > 0) ||
      (e.type === "submit" && e.result === "incorrect"),
  );
}

export function levelStats(
  archive: readonly GameRecord[],
  now: number,
): LevelStats[] {
  const today = dayIndex(now);
  return LEVELS.map((level) => {
    let solved = 0;
    let total = 0;
    let bestMs: number | null = null;
    let mistakeGames = 0;
    const days = new Set<number>();
    for (const r of archive) {
      if (r.level !== level) continue;
      const at = solvedAt(r);
      if (at === null) continue;
      const ms = activeMs(r, at);
      solved++;
      total += ms;
      bestMs = bestMs === null ? ms : Math.min(bestMs, ms);
      if (hadMistake(r)) mistakeGames++;
      days.add(dayIndex(at));
    }
    let streak = 0;
    for (let d = days.has(today) ? today : today - 1; days.has(d); d--)
      streak++;
    return {
      level,
      solved,
      bestMs,
      averageMs: solved ? Math.round(total / solved) : null,
      streak,
      mistakeGames,
      mistakeRate: solved ? mistakeGames / solved : null,
    };
  });
}
