import { describe, expect, it, vi } from "vitest";
import { createLocalStoragePersistence, KEYS, type KeyValueStorage } from "./persistence";
import { DEFAULT_SETTINGS, createSettingsStore, normalizeSettings } from "./settings";

function setup(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(KEYS.settings, JSON.stringify(initial));
  const storage: KeyValueStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { data, persistence: createLocalStoragePersistence(() => storage) };
}

describe("normalizeSettings", () => {
  it("returns defaults for nothing or junk", () => {
    for (const raw of [null, undefined, 5, "x", [], {}]) {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("drops unknown keys, defaults missing ones, rejects invalid values", () => {
    const out = normalizeSettings({
      theme: "dark",
      leftHanded: "yes",
      idleMinutes: -3,
      showTimer: false,
      bogus: 1,
      __proto__: { entryMode: "digit-first" },
    });
    expect(out).toEqual({ ...DEFAULT_SETTINGS, theme: "dark", showTimer: false });
    expect("bogus" in out).toBe(false);
  });
});

describe("settings store", () => {
  it("starts from defaults and persists updates", () => {
    const { data, persistence } = setup();
    const store = createSettingsStore(persistence);
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
    store.update({ autoCandidates: true, idleMinutes: 10 });
    expect(JSON.parse(data.get(KEYS.settings)!)).toMatchObject({
      autoCandidates: true,
      idleMinutes: 10,
    });
    expect(createSettingsStore(persistence).getSnapshot().idleMinutes).toBe(10);
  });

  it("migrates an old stored shape: keeps known, drops unknown, fills missing", () => {
    const { persistence } = setup({ theme: "light", oldFlag: true });
    expect(createSettingsStore(persistence).getSnapshot()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
    });
  });

  it("adopts the legacy theme key only when no theme is stored", () => {
    expect(createSettingsStore(setup().persistence, () => "dark").getSnapshot().theme).toBe("dark");
    expect(
      createSettingsStore(setup({ theme: "light" }).persistence, () => "dark").getSnapshot().theme,
    ).toBe("light");
  });

  it("notifies subscribers only on real changes and ignores invalid patches", () => {
    const store = createSettingsStore(setup().persistence);
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.update({ showTimer: true });
    store.update({ idleMinutes: 1.5 });
    expect(fn).not.toHaveBeenCalled();
    store.update({ showTimer: false });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    store.update({ showTimer: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
