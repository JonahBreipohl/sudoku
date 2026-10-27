import { useEffect, useRef, useState } from "react";
import { formatClockSeconds, formatLongDate } from "../clock";
import { useSecondTick } from "../useSecondTick";
import { DisplayBoard } from "./DisplayBoard";
import { TodayStats } from "./TodayStats";
import "./display.css";

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** Calm side-monitor view: a large clock and date. Ticks once a second and stops while hidden. */
export function DisplayMode({ onExit }: { onExit: () => void }) {
  const [visible, setVisible] = useState(pageVisible);
  useEffect(() => {
    const sync = () => setVisible(pageVisible());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const now = useSecondTick(visible);

  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) exitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus(), []);

  return (
    <div className="display">
      <main className="display-body">
        <h1 className="sr-only">Display mode</h1>
        <div className="display-clock">
          <p className="display-time">{formatClockSeconds(now)}</p>
          <p className="display-date">{formatLongDate(now)}</p>
          <TodayStats now={now} />
        </div>
        <DisplayBoard />
      </main>
      <button ref={buttonRef} type="button" className="ctl display-exit" onClick={onExit} aria-keyshortcuts="Escape">
        Exit Display
      </button>
    </div>
  );
}
