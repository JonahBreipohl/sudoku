import { useSyncExternalStore } from "react";
import { getSettingsStore, type Settings } from "../state/settings";

/** Current settings plus an updater; components never write storage themselves. */
export function useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void } {
  const store = getSettingsStore();
  const settings = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { settings, update: store.update };
}
