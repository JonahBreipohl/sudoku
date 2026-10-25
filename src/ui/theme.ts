import { getSettingsStore, type ThemePref } from "../state/settings";

export type { ThemePref };
export const THEME_ORDER: readonly ThemePref[] = ["system", "light", "dark"];

/** "system" removes the attribute so the prefers-color-scheme media query decides. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** Applies the stored theme synchronously (called before first render) and follows changes. */
export function initTheme(): void {
  const store = getSettingsStore();
  applyTheme(store.getSnapshot().theme);
  store.subscribe(() => applyTheme(store.getSnapshot().theme));
}
