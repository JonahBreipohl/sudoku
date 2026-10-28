// Daily puzzle: the bank puzzle picked by the local date, at the weekday's level
// (docs/ARCHITECTURE.md, "Puzzle bank"). Pure except for the injected fetch; dates are injected
// so the same-date-same-puzzle rule is testable across time zones.

import { validateBank, type Bank } from "../engine/bank";
import type { Level } from "../engine/step";
import type { GameRecord } from "./events";
import type { SuppliedPuzzle } from "./newGame";
import { dayIndex, solvedAt } from "./today";

/** Indexed by Date#getDay(): Sunday first. */
const ROTATION: readonly Level[] = ["master", "easy", "medium", "medium", "hard", "hard", "expert"];

export function dailyLevel(date: Date): Level {
  return ROTATION[date.getDay()]!;
}

/** Local calendar date as YYYY-MM-DD; the seed, so it must not depend on UTC. */
export function dateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** FNV-1a, 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const dailyId = (key: string) => `daily-${key}`;

export interface DailyOptions {
  fetch: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  baseUrl?: string;
  /** Receives the bank id the daily was picked from, so regular games skip that puzzle. */
  played?: { add(id: string): void };
}

/** Rejects when the bank cannot be loaded, so the caller keeps the current game. */
export async function dailyPuzzle(date: Date, opts: DailyOptions): Promise<SuppliedPuzzle> {
  const level = dailyLevel(date);
  const key = dateKey(date);
  const res = await opts.fetch(`${opts.baseUrl ?? "puzzles/"}${level}.json`);
  const json: unknown = res.ok ? await res.json() : null;
  if (!validateBank(json).ok) throw new Error(`daily bank for ${level} unavailable`);
  const puzzles = (json as Bank).puzzles;
  const p = puzzles[hashString(`${key}:${level}`) % puzzles.length];
  if (!p) throw new Error(`daily bank for ${level} is empty`);
  opts.played?.add(p.id);
  return { id: dailyId(key), puzzle: p.puzzle, solution: p.solution, level, score: p.score, source: "daily" };
}

export interface DailyStats {
  solved: number;
  /** Consecutive local days ending today (or yesterday if none yet today) with a daily solve. */
  streak: number;
}

export function dailyStats(archive: readonly GameRecord[], now: number): DailyStats {
  const today = dayIndex(now);
  const days = new Set<number>();
  let solved = 0;
  for (const r of archive) {
    if (r.source !== "daily") continue;
    const at = solvedAt(r);
    if (at === null) continue;
    solved++;
    days.add(dayIndex(at));
  }
  let streak = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) streak++;
  return { solved, streak };
}

/** True when a daily record for this local date was solved (archived, or still the current game). */
export function dailySolvedOn(date: Date, records: readonly (GameRecord | undefined)[]): boolean {
  const id = dailyId(dateKey(date));
  return records.some((r) => r?.id === id && solvedAt(r) !== null);
}
