// Runtime puzzle source: loads public/puzzles/<level>.json lazily, hands out the next unplayed
// puzzle in score order, and falls back to worker generation when the bank is exhausted or
// cannot be loaded. Played ids go through an injected store so tests and persistence stay separate.

import { validateBank, type Bank, type BankPuzzle } from "../engine/bank";
import type { Level } from "../engine/step";

export interface PlayedStore {
  has(id: string): boolean;
  add(id: string): void;
}

export interface Generator {
  generate(level: Level, seed: number | string): Promise<{ puzzle: string; solution: string; score: number }>;
}

export interface NextPuzzle {
  id: string;
  puzzle: string;
  solution: string;
  level: Level;
  score: number;
  source: "bank" | "generated";
}

export interface PuzzleSourceOptions {
  fetch: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  generator: Generator;
  played: PlayedStore;
  /** Where the bank files live, relative to the page. */
  baseUrl?: string;
  /** Seeds generation; injectable for deterministic tests. */
  seed?: () => string;
}

export interface PuzzleSource {
  nextPuzzle(level: Level): Promise<NextPuzzle>;
}

const PLAYED_KEY = "sudoku.played";
/** Bounds localStorage growth; generated ids carry a whole 81-char puzzle each. */
export const PLAYED_CAP = 500;

/** Played ids kept in localStorage; storage failures degrade to in-memory only. */
export function createPlayedStore(storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): PlayedStore {
  const ids = new Set<string>();
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PLAYED_KEY) ?? "[]");
    if (Array.isArray(raw)) for (const id of raw.slice(-PLAYED_CAP)) if (typeof id === "string") ids.add(id);
  } catch {
    /* unreadable storage: start empty */
  }
  return {
    has: (id) => ids.has(id),
    add(id) {
      // Re-insert so a replayed id counts as recent; Set iterates oldest first.
      ids.delete(id);
      ids.add(id);
      while (ids.size > PLAYED_CAP) ids.delete(ids.values().next().value as string);
      try {
        storage?.setItem(PLAYED_KEY, JSON.stringify([...ids]));
      } catch {
        /* quota or private mode: keep the in-memory set */
      }
    },
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createPuzzleSource(opts: PuzzleSourceOptions): PuzzleSource {
  const { fetch, generator, played, baseUrl = "puzzles/" } = opts;
  const seed = opts.seed ?? (() => `${Date.now()}:${Math.random()}`);
  // Cache the promise so concurrent callers share one fetch; failures cache an empty list for
  // the session so we do not retry a missing bank on every request.
  const banks = new Map<Level, Promise<BankPuzzle[]>>();

  const load = (level: Level): Promise<BankPuzzle[]> => {
    let p = banks.get(level);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(`${baseUrl}${level}.json`);
          if (!res.ok) return [];
          const json = await res.json();
          if (!validateBank(json).ok) return [];
          return (json as Bank).puzzles;
        } catch {
          return [];
        }
      })();
      banks.set(level, p);
    }
    return p;
  };

  return {
    async nextPuzzle(level) {
      const next = (await load(level)).find((p) => !played.has(p.id));
      if (next) {
        played.add(next.id);
        return { id: next.id, puzzle: next.puzzle, solution: next.solution, level, score: next.score, source: "bank" };
      }
      const g = await generator.generate(level, seed());
      // Generated puzzles have no bank id; the puzzle string itself identifies them.
      const id = `g-${g.puzzle}`;
      played.add(id);
      return { id, puzzle: g.puzzle, solution: g.solution, level, score: g.score, source: "generated" };
    },
  };
}
