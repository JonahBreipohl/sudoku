// First launch with nothing saved: a random unplayed Easy bank puzzle instead of a hardcoded
// sample. Pure except for the injected fetch and random; rejects when the bank cannot load so
// the caller can fall back to the sample.

import { validateBank, type Bank } from "../engine/bank";
import type { GameRecord } from "./events";
import { newGameRecord } from "./store";

export interface FreshStartOptions {
  fetch: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  baseUrl?: string;
  played?: { has(id: string): boolean; add(id: string): void };
  /** In [0, 1); injectable for tests. */
  random?: () => number;
  now?: () => number;
}

export async function freshStartRecord(opts: FreshStartOptions): Promise<GameRecord> {
  const res = await opts.fetch(`${opts.baseUrl ?? "puzzles/"}easy.json`);
  const json: unknown = res.ok ? await res.json() : null;
  if (!validateBank(json).ok) throw new Error("easy bank unavailable");
  const all = (json as Bank).puzzles;
  const unplayed = all.filter((p) => !opts.played?.has(p.id));
  const pool = unplayed.length > 0 ? unplayed : all;
  const p = pool[Math.floor((opts.random ?? Math.random)() * pool.length)];
  if (!p) throw new Error("easy bank is empty");
  opts.played?.add(p.id);
  return newGameRecord({
    id: p.id,
    puzzle: p.puzzle,
    solution: p.solution,
    level: "easy",
    score: p.score,
    source: "bank",
    createdAt: (opts.now ?? Date.now)(),
  });
}
