import { useEffect, useRef, useState } from "react";
import { display, spotify } from "../strings";
import { useSettings } from "../useSettings";
import { ThemeToggle } from "../components/ThemeToggle";
import { Icon } from "../icons";
import { SettingsDialog } from "../components/SettingsDialog";
import { NowPlayingCard } from "../spotify/NowPlayingCard";
import { formatClockSeconds, formatLongDate } from "../clock";
import { useSecondTick } from "../useSecondTick";
import { useDrift } from "./useDrift";
import { DisplayControls } from "./DisplayControls";
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

  const { dx, dy, night } = useDrift(now);
  const { settings, update } = useSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape in the settings dialog closes the dialog, not Display.
      if ((e.target as HTMLElement | null)?.closest?.("dialog")) return;
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
        <DisplayBoard />
      </main>
      <DisplayControls>
        <button type="button" className="ctl" aria-pressed={settings.nowPlaying} onClick={() => update({ nowPlaying: !settings.nowPlaying })}>
          <Icon name="note" />
          {settings.nowPlaying ? spotify.toggleOn : spotify.toggleOff}
        </button>
        <ThemeToggle />
        <button type="button" className="ctl" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
          <Icon name="sliders" />
          {display.settings}
        </button>
      </DisplayControls>
      <button ref={buttonRef} type="button" className="ctl display-exit" onClick={onExit} aria-keyshortcuts="Escape">
        <Icon name="arrowLeft" />
        Exit Display
      </button>
      {settingsOpen && <SettingsDialog settings={settings} onChange={update} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
