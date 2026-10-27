import { createRng, type Level } from "../../engine";
import type { BankPuzzle } from "../../engine/bank";

export const DEFAULT_STEP_MS = 6000;
const MIN_STEP_MS = 1000;
const MAX_STEP_MS = 60_000;

export interface WatchParams {
  enabled: boolean;
  /** Fixed seed for a reproducible sequence of puzzles; null picks a fresh one per session. */
  seed: string | null;
  stepMs: number;
}

/** `?watch` turns it on, `?seed=` fixes the puzzle sequence, `?interval=` is seconds per step. */
export function watchParams(search: string): WatchParams {
  const p = new URLSearchParams(search);
  const secs = Number(p.get("interval"));
  const stepMs = p.get("interval") && Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_STEP_MS;
  return {
    enabled: p.has("watch"),
    seed: p.get("seed") || null,
    stepMs: Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, Math.round(stepMs))),
  };
}

/** Watching favors short, readable solves, so only the lower levels are drawn. */
const WATCH_LEVELS: readonly Level[] = ["easy", "medium", "hard"];

/** Deterministic pick of the n-th puzzle's level and index for a seed. */
export function pickWatchPuzzle(seed: string, n: number, counts: (level: Level) => number): { level: Level; index: number } {
  const rng = createRng(`${seed}:${n}`);
  const level = WATCH_LEVELS[rng.int(WATCH_LEVELS.length)]!;
  const size = counts(level);
  return { level, index: size > 0 ? rng.int(size) : 0 };
}

export type { BankPuzzle };
