import type { CandidateState } from "../candidates";
import { LEVELS, TECHNIQUES, techniqueInfo, type Level, type Step, type Technique, type TechniqueId } from "../step";

/** Returns the first instance of a technique in a deterministic order, or null. Must not mutate state. */
export type Finder = (state: CandidateState) => Step | null;

export interface RegisteredTechnique extends Technique {
  readonly find: Finder;
}

export interface TechniqueRegistry {
  /** Adds a finder for a technique id from TECHNIQUES; level and weight come from that table. */
  register(id: TechniqueId, find: Finder): void;
  has(id: TechniqueId): boolean;
  /** Registered techniques at or below maxLevel, cheapest tier first, then by weight. */
  list(maxLevel?: Level): readonly RegisteredTechnique[];
}

const levelRank = (level: Level): number => LEVELS.indexOf(level);
const tableRank = (id: TechniqueId): number => TECHNIQUES.findIndex((t) => t.id === id);

/** Tier first, then weight; equal weights keep TECHNIQUES order so the result is deterministic. */
function compareTechniques(a: Technique, b: Technique): number {
  return levelRank(a.level) - levelRank(b.level) || a.weight - b.weight || tableRank(a.id) - tableRank(b.id);
}

/** A fresh, empty registry. Tests use their own so stub registrations never leak. */
export function createRegistry(): TechniqueRegistry {
  const entries = new Map<TechniqueId, RegisteredTechnique>();
  let sorted: RegisteredTechnique[] | null = null;

  return {
    register(id, find) {
      if (entries.has(id)) throw new Error(`Technique already registered: ${id}`);
      entries.set(id, { ...techniqueInfo(id), find });
      sorted = null;
    },
    has: (id) => entries.has(id),
    list(maxLevel = "master") {
      sorted ??= [...entries.values()].sort(compareTechniques);
      const max = levelRank(maxLevel);
      return sorted.filter((t) => levelRank(t.level) <= max);
    },
  };
}

/**
 * The registry the app uses. Technique modules call registerTechnique at import time, and
 * ./techniques/index.ts imports every one of them for that side effect, so adding a technique
 * is one new file plus one import line there. Registration order does not matter.
 */
export const defaultRegistry: TechniqueRegistry = createRegistry();

export function registerTechnique(id: TechniqueId, find: Finder): void {
  defaultRegistry.register(id, find);
}
