import { useSyncExternalStore } from "react";
import { effectiveTheme, toggledTheme } from "../theme";
import { useSettings } from "../useSettings";
import { themeToggle as t } from "../strings";

const QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(cb: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}
const systemDark = () => window.matchMedia?.(QUERY).matches ?? false;

/**
 * One-tap light/dark switch. The icon (moon or sun) and aria-pressed carry the state, so it never
 * relies on color. While the theme is "system" it reflects, and flips away from, what the OS shows.
 */
export function ThemeToggle({ className = "ctl" }: { className?: string }) {
  const { settings, update } = useSettings();
  const sys = useSyncExternalStore(subscribeSystem, systemDark, () => false);
  const dark = effectiveTheme(settings.theme, sys) === "dark";
  return (
    <button
      type="button"
      className={`${className} theme-toggle`}
      aria-pressed={dark}
      aria-label={t.label}
      title={dark ? t.toLight : t.toDark}
      onClick={() => update({ theme: toggledTheme(settings.theme, sys) })}
    >
      <span aria-hidden="true">{dark ? "☾" : "☀"}</span>
    </button>
  );
}
