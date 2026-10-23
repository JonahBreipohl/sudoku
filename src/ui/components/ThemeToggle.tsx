import { useEffect, useState } from "react";
import { THEME_ORDER, applyTheme, loadTheme, saveTheme, type ThemePref } from "../theme";

const LABELS: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(loadTheme);

  useEffect(() => {
    applyTheme(pref);
    saveTheme(pref);
  }, [pref]);

  const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length]!;
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Theme: ${LABELS[pref]}. Switch to ${LABELS[next]}`}
      onClick={() => setPref(next)}
    >
      Theme: {LABELS[pref]}
    </button>
  );
}
