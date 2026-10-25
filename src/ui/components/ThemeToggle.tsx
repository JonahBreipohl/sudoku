import { THEME_ORDER, type ThemePref } from "../theme";
import { useSettings } from "../useSettings";

const LABELS: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const { settings, update } = useSettings();
  const pref = settings.theme;

  const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length]!;
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Theme: ${LABELS[pref]}. Switch to ${LABELS[next]}`}
      onClick={() => update({ theme: next })}
    >
      Theme: {LABELS[pref]}
    </button>
  );
}
