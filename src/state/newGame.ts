// New game and reset at the state level. A new game takes a puzzle from any source (bank,
// generated, import), archives the record being left, and returns the fresh record; the caller
// swaps its store. Never imports ui.

import type { Level } from "../engine";
import type { GameRecord, GameSource } from "./events";
import type { PersistenceAdapter } from "./persistence";
import { hasProgress } from "./progress";
import { newGameRecord, type GameStore } from "./store";
import { activeMs } from "./timer";

export interface SuppliedPuzzle {
  id: string;
  puzzle: string;
  solution: string;
  level: Level;
  score: number;
  source: GameSource;
}

/** The runtime PuzzleSource satisfies this; an import source supplies its own puzzle. */
export interface PuzzleSupplier {
  nextPuzzle(level: Level): Promise<SuppliedPuzzle>;
}

export interface NewGameOptions {
  /** The record being left. */
  current?: GameRecord;
  persistence?: Pick<PersistenceAdapter, "archive">;
  now?: () => number;
}

/**
 * The record to archive when leaving `record`, or null when nothing is worth keeping: a
 * submitted game is already archived, and an untouched one has no player work.
 */
export function abandonedRecord(record: GameRecord, now: number): GameRecord | null {
  if (!hasProgress(record)) return null;
  return { ...record, status: "abandoned", activeMs: activeMs(record, now) };
}

/** Fetches a puzzle first, so a failed fetch leaves the current game and archive untouched. */
export async function newGame(
  level: Level,
  source: PuzzleSupplier,
  options: NewGameOptions = {},
): Promise<GameRecord> {
  const now = options.now ?? Date.now;
  const p = await source.nextPuzzle(level);
  if (options.current) {
    const old = abandonedRecord(options.current, now());
    if (old) options.persistence?.archive(old);
  }
  return newGameRecord({ ...p, createdAt: now() });
}

/** Clears the board back to the givens; the reset event keeps it undoable. */
export function resetGame(store: Pick<GameStore, "dispatch">): void {
  store.dispatch({ type: "reset" });
}
