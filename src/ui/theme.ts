export type ThemePref = "light" | "dark" | "system";

const KEY = "sudoku.theme";
export const THEME_ORDER: readonly ThemePref[] = ["system", "light", "dark"];

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to system.
  }
  return "system";
}

export function saveTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Not persisting is acceptable; the choice still applies for this visit.
  }
}

/** "system" removes the attribute so the prefers-color-scheme media query decides. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}
