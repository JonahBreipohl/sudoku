// Persistence (docs/ARCHITECTURE.md, "Persistence"). Storage is untrusted input: an older
// build, another tab or a hand edit may have written anything, and the browser may refuse
// writes (quota, private mode). So nothing here throws, and bad data is moved aside under a
// "corrupt" key instead of being deleted, so it can still be recovered by hand.

import { isGameRecord, type GameRecord } from "./events";

export const ARCHIVE_CAP = 500;

export const KEYS = {
  current: "sudoku:v1:current",
  archive: "sudoku:v1:archive",
  settings: "sudoku:v1:settings",
} as const;
const ASIDE_PREFIX = "sudoku:corrupt:";

/** Settings are an opaque flat object here; the settings module owns their shape. */
export type StoredSettings = Record<string, unknown>;

export interface PersistenceAdapter {
  loadCurrent(): GameRecord | null;
  saveCurrent(record: GameRecord): void;
  clearCurrent(): void;
  /** Completed games, oldest first. */
  list(): GameRecord[];
  /** Adds (or replaces, by id) a completed game; the oldest beyond the cap are dropped. */
  archive(record: GameRecord): void;
  remove(id: string): void;
  loadSettings(): StoredSettings | null;
  saveSettings(settings: StoredSettings): void;
}

/** The slice of the Web Storage API we use, so tests can pass an in-memory fake. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isPlainObject = (v: unknown): v is StoredSettings =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function createLocalStoragePersistence(
  getStorage: () => KeyValueStorage | null = defaultStorage,
  now: () => number = Date.now,
): PersistenceAdapter {
  const attempt = <T>(fn: (s: KeyValueStorage) => T, fallback: T): T => {
    try {
      const s = getStorage();
      return s ? fn(s) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key: string, value: unknown) =>
    attempt((s) => void s.setItem(key, JSON.stringify(value)), undefined);

  const setAside = (key: string, raw: string) =>
    attempt((s) => {
      const name = key.replace(/^sudoku:/, "");
      try {
        s.setItem(`${ASIDE_PREFIX}${name}:${now()}`, raw);
      } catch {
        // No room to keep a copy; still clear the key so the app can start cleanly.
      }
      s.removeItem(key);
    }, undefined);

  /** Reads and validates `key`; invalid contents are moved aside and read as absent. */
  const read = <T>(key: string, valid: (v: unknown) => v is T): T | null =>
    attempt((s) => {
      const raw = s.getItem(key);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (valid(parsed)) return parsed;
      } catch {
        // fall through to set-aside
      }
      setAside(key, raw);
      return null;
    }, null);

  const isArchive = (v: unknown): v is GameRecord[] => Array.isArray(v) && v.every(isGameRecord);

  const list = () => read(KEYS.archive, isArchive) ?? [];

  return {
    loadCurrent: () => read(KEYS.current, isGameRecord),
    saveCurrent: (record) => write(KEYS.current, record),
    clearCurrent: () => attempt((s) => void s.removeItem(KEYS.current), undefined),
    list,
    archive(record) {
      const rest = list().filter((r) => r.id !== record.id);
      write(KEYS.archive, [...rest, record].slice(-ARCHIVE_CAP));
    },
    remove(id) {
      write(
        KEYS.archive,
        list().filter((r) => r.id !== id),
      );
    },
    loadSettings: () => read(KEYS.settings, isPlainObject),
    saveSettings: (settings) => write(KEYS.settings, settings),
  };
}

function defaultStorage(): KeyValueStorage | null {
  // Touching window.localStorage itself can throw (blocked site data).
  return typeof window === "undefined" ? null : window.localStorage;
}
