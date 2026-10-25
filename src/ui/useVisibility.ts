import { useEffect } from "react";
import type { GameStore } from "../state/store";

/** Logs `hidden`/`visible` from the Page Visibility API so a hidden tab stops the timer. */
export function useVisibility(store: GameStore): void {
  useEffect(() => {
    const sync = () => {
      const { log, status } = store.getSnapshot().record;
      if (status === "submitted") return;
      // Track our own last visibility event so repeated events are not logged.
      let hidden = false;
      for (const e of log) {
        if (e.type === "hidden") hidden = true;
        else if (e.type === "visible") hidden = false;
      }
      const nowHidden = document.visibilityState === "hidden";
      if (nowHidden !== hidden) store.dispatch({ type: nowHidden ? "hidden" : "visible" });
    };
    if (!store.getSnapshot().record.log.some((e) => e.type === "start"))
      store.dispatch({ type: "start" });
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [store]);
}
