import { getSettingsStore, type ThemePref } from "../state/settings";
import { readSharedTheme, sharedThemeCookie } from "./sharedTheme";

export type { ThemePref };
export const THEME_ORDER: readonly ThemePref[] = ["system", "light", "dark"];

/** What the page shows now: "system" resolves through the OS preference. */
export function effectiveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** The one-tap switch flips what is shown and stores it explicitly; Settings can return to System. */
export function toggledTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return effectiveTheme(pref, systemDark) === "dark" ? "light" : "dark";
}

/** "system" removes the attribute so the prefers-color-scheme media query decides. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/**
 * Applies the theme synchronously (called before first render) and follows changes. The cookie
 * shared with jonahbreipohl.com and its other projects wins over the stored setting, and every
 * change here is written back to it, so the choice carries between the sites.
 */
export function initTheme(): void {
  const store = getSettingsStore();
  const adopt = () => {
    const shared = readSharedTheme(document.cookie);
    if (shared && shared !== store.getSnapshot().theme) store.update({ theme: shared });
  };
  adopt();
  applyTheme(store.getSnapshot().theme);
  store.subscribe(() => {
    const pref = store.getSnapshot().theme;
    applyTheme(pref);
    if (readSharedTheme(document.cookie) !== pref) {
      document.cookie = sharedThemeCookie(pref, location.hostname, location.protocol);
    }
  });
  // Back from another site restores this page from the back/forward cache, and another tab may
  // have switched: pick up whatever was chosen meanwhile.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) adopt();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) adopt();
  });
}
