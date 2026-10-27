// Typed user settings (docs/ARCHITECTURE.md, "Persistence"). Storage is untrusted, so every
// field is validated individually: unknown keys are dropped, and missing or invalid ones
// fall back to their default instead of discarding the whole object.

import { createLocalStoragePersistence, type PersistenceAdapter } from "./persistence";

export type ThemePref = "light" | "dark" | "system";
export type EntryMode = "digit-first" | "cell-first";

export interface Settings {
  theme: ThemePref;
  entryMode: EntryMode;
  autoCandidates: boolean;
  checkHighlighting: boolean;
  wallClock: boolean;
  leftHanded: boolean;
  /** Minutes without input before idle play switches to Display mode; 0 disables it. */
  idleMinutes: number;
  showTimer: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  theme: "system",
  entryMode: "cell-first",
  autoCandidates: false,
  checkHighlighting: true,
  wallClock: true,
  leftHanded: false,
  idleMinutes: 10,
  showTimer: true,
};

export const MAX_IDLE_MINUTES = 240;

const oneOf =
  <T extends string>(...allowed: T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (allowed as string[]).includes(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isIdle = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_IDLE_MINUTES;

const VALIDATORS: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  theme: oneOf<ThemePref>("light", "dark", "system"),
  entryMode: oneOf<EntryMode>("digit-first", "cell-first"),
  autoCandidates: isBool,
  checkHighlighting: isBool,
  wallClock: isBool,
  leftHanded: isBool,
  idleMinutes: isIdle,
  showTimer: isBool,
};

/** Builds complete, valid settings from whatever was stored. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  const dst = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(VALIDATORS) as (keyof Settings)[]) {
    const v = src[key];
    if (Object.hasOwn(src, key) && VALIDATORS[key](v)) dst[key] = v;
  }
  return out;
}

/** Theme key used before settings existed; read once so the choice survives the move. */
const LEGACY_THEME_KEY = "sudoku.theme";

function legacyTheme(): ThemePref | null {
  try {
    const v = window.localStorage.getItem(LEGACY_THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

export interface SettingsStore {
  getSnapshot(): Settings;
  update(patch: Partial<Settings>): void;
  subscribe(listener: () => void): () => void;
}

export function createSettingsStore(
  persistence: PersistenceAdapter,
  migrateLegacyTheme: () => ThemePref | null = () => null,
): SettingsStore {
  const stored = persistence.loadSettings();
  let current = normalizeSettings(stored);
  if (stored === null || !("theme" in stored)) {
    const legacy = migrateLegacyTheme();
    if (legacy) current = { ...current, theme: legacy };
  }
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    update(patch) {
      const next = normalizeSettings({ ...current, ...patch });
      if (VALIDATOR_KEYS.every((k) => next[k] === current[k])) return;
      current = next;
      persistence.saveSettings({ ...current });
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const VALIDATOR_KEYS = Object.keys(VALIDATORS) as (keyof Settings)[];

let shared: SettingsStore | null = null;
/** App-wide settings backed by localStorage; created on first use. */
export function getSettingsStore(): SettingsStore {
  shared ??= createSettingsStore(createLocalStoragePersistence(), legacyTheme);
  return shared;
}
