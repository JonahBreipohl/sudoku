import { useCallback, useEffect, useRef, useState } from "react";
import { createWakeLock, fullscreenSupported, wakeLockSupported, type WakeLockController } from "./wakeLock";

function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

/** Fullscreen and keep-awake toggles. Each renders nothing where its API is missing. */
export function DisplayControls() {
  const canFullscreen = fullscreenSupported(typeof document === "undefined" ? undefined : document);
  const canWake = wakeLockSupported(typeof navigator === "undefined" ? undefined : (navigator as Navigator));

  const [full, setFull] = useState(() => canFullscreen && isFullscreen());
  useEffect(() => {
    if (!canFullscreen) return;
    const sync = () => setFull(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [canFullscreen]);

  const toggleFull = useCallback(() => {
    const p = isFullscreen() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    p.catch(() => {}); // refused by the browser: the button simply stays off
  }, []);

  const [awake, setAwake] = useState(false);
  const [wanted, setWanted] = useState(false);
  const ctlRef = useRef<WakeLockController | null>(null);
  useEffect(() => {
    if (!canWake) return;
    const ctl = createWakeLock(navigator.wakeLock, document, setAwake);
    ctlRef.current = ctl;
    return () => {
      ctl.dispose();
      ctlRef.current = null;
    };
  }, [canWake]);

  const toggleWake = useCallback(() => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    if (ctl.isEnabled()) {
      setWanted(false);
      void ctl.disable();
    } else {
      setWanted(true);
      void ctl.enable();
    }
  }, []);

  if (!canFullscreen && !canWake) return null;
  return (
    <div className="display-controls">
      {canFullscreen && (
        <button type="button" className="ctl" aria-pressed={full} onClick={toggleFull}>
          {full ? "Fullscreen: on" : "Fullscreen: off"}
        </button>
      )}
      {canWake && (
        <button type="button" className="ctl" aria-pressed={wanted} onClick={toggleWake}>
          {wanted ? (awake ? "Keep awake: on" : "Keep awake: waiting") : "Keep awake: off"}
        </button>
      )}
    </div>
  );
}
