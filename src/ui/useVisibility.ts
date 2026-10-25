import { useEffect } from "react";
import type { GameStore } from "../state/store";

/** Logs `hidden`/`visible` from the Page Visibility API so a hidden tab stops the timer. */
export function useVisibility(store: GameStore): void {
  useEffect(() => {
    // Closing the tab must stop the clock, or the closed time would count on resume.
    let closing = false;
    const onPageHide = () => {
      closing = true;
      sync();
    };
    const onPageShow = () => {
      closing = false;
      sync();
    };
    const sync = () => {
      const { log, status } = store.getSnapshot().record;
      if (status === "submitted") return;
      // Track our own last visibility event so repeated events are not logged.
      let hidden = false;
      for (const e of log) {
        if (e.type === "hidden") hidden = true;
        else if (e.type === "visible") hidden = false;
      }
      const nowHidden = closing || document.visibilityState === "hidden";
      if (nowHidden !== hidden) store.dispatch({ type: nowHidden ? "hidden" : "visible" });
    };
    if (!store.getSnapshot().record.log.some((e) => e.type === "start"))
      store.dispatch({ type: "start" });
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [store]);
}
