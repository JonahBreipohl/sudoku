// Display-mode "today" stats derived from the archive. Pure: the caller supplies `now`, so
// the midnight rollover is testable. Days are local calendar days, as the player sees them.

import type { GameRecord } from "./events";
import { activeMs } from "./timer";

export interface TodayStats {
  solved: number;
  /** Summed active play ms of today's solves. */
  totalMs: number;
  /** Fastest solve today, or null when nothing was solved. */
  bestMs: number | null;
  /** Consecutive local days with a solve, ending today (or yesterday if none yet today). */
  streak: number;
}

/** Day index in local time; built from calendar parts so DST days still step by exactly one. */
export function dayIndex(at: number): number {
  const d = new Date(at);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Epoch ms a game was solved, or null if it is not a solved game. */
export function solvedAt(r: GameRecord): number | null {
  if (r.status !== "submitted") return null;
  for (let i = r.log.length - 1; i >= 0; i--) {
    const e = r.log[i]!;
    if (e.type === "submit") return e.result === "solved" ? e.at : null;
  }
  return null;
}

export function todayStats(archive: readonly GameRecord[], now: number): TodayStats {
  const today = dayIndex(now);
  const days = new Set<number>();
  let solved = 0;
  let totalMs = 0;
  let bestMs: number | null = null;
  for (const r of archive) {
    const at = solvedAt(r);
    if (at === null) continue;
    const day = dayIndex(at);
    days.add(day);
    if (day !== today) continue;
    const ms = activeMs(r, at);
    solved++;
    totalMs += ms;
    bestMs = bestMs === null ? ms : Math.min(bestMs, ms);
  }
  let streak = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  return { solved, totalMs, bestMs, streak };
}
