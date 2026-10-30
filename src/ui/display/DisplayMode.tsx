import { useEffect, useRef, useState } from "react";
import { display, spotify } from "../strings";
import { useSettings } from "../useSettings";
import { ThemeToggle } from "../components/ThemeToggle";
import { NowPlayingCard } from "../spotify/NowPlayingCard";
import { formatClockSeconds, formatLongDate } from "../clock";
import { useSecondTick } from "../useSecondTick";
import { useDrift } from "./useDrift";
import { DisplayControls } from "./DisplayControls";
import { DisplayBoard } from "./DisplayBoard";
import { TodayStats } from "./TodayStats";
import { WatchPuzzle } from "./WatchPuzzle";
import { watchParams } from "./watch";
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

  const { dx, dy, night } = useDrift(now);
  const { settings, update } = useSettings();

  const [params] = useState(() => watchParams(window.location.search));
  const [watching, setWatching] = useState(params.enabled);

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
    <div className="display" data-night={night ? "true" : undefined}>
      <main className="display-body" style={{ "--drift-x": `${dx}px`, "--drift-y": `${dy}px` } as React.CSSProperties}>
        <h1 className="sr-only">{display.heading}</h1>
        <div className="display-clock">
          <p className="display-time">{formatClockSeconds(now)}</p>
          <p className="display-date">{formatLongDate(now)}</p>
          <TodayStats now={now} />
          {settings.nowPlaying && <NowPlayingCard clientId={settings.spotifyClientId} now={now} active={visible} />}
        </div>
        {watching ? <WatchPuzzle stepMs={params.stepMs} seed={params.seed} active={visible} /> : <DisplayBoard />}
      </main>
      <button type="button" className="ctl display-watch-toggle" aria-pressed={watching} onClick={() => setWatching((w) => !w)}>
        Watch puzzle
      </button>
      <DisplayControls>
        <button type="button" className="ctl" aria-pressed={settings.nowPlaying} onClick={() => update({ nowPlaying: !settings.nowPlaying })}>
          {settings.nowPlaying ? spotify.toggleOn : spotify.toggleOff}
        </button>
        <ThemeToggle />
      </DisplayControls>
      <button ref={buttonRef} type="button" className="ctl display-exit" onClick={onExit} aria-keyshortcuts="Escape">
        Exit Display
      </button>
    </div>
  );
}
