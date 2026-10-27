export type AppMode = "play" | "display";

export function modeFromSearch(search: string): AppMode {
  return new URLSearchParams(search).get("mode") === "display" ? "display" : "play";
}

/** Keeps the URL in step with the toggle so a reload stays in the same mode. */
export function searchForMode(search: string, mode: AppMode): string {
  const p = new URLSearchParams(search);
  if (mode === "display") p.set("mode", "display");
  else p.delete("mode");
  const s = p.toString();
  return s ? `?${s}` : "";
}
