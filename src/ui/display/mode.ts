import { isPaused } from "../../state/timer";
import type { GameStore } from "../../state/store";

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

/** Pauses a running, unsubmitted game on entering Display; a no-op when already paused or submitted. */
export function pauseForDisplay(store: Pick<GameStore, "dispatch" | "getSnapshot">): void {
  const { record } = store.getSnapshot();
  if (record.status === "playing" && !isPaused(record)) store.dispatch({ type: "pause" });
}
