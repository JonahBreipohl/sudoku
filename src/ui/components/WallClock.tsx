import { useEffect, useState } from "react";
import { formatWallClock } from "../clock";
import { clock } from "../strings";
import { useSecondTick } from "../useSecondTick";

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** Time of day in the user's locale format. The side panel is display:none on phones, so the
 *  clock is hidden there; a hidden tab stops ticking and resyncs when shown again. */
export function WallClock() {
  const [visible, setVisible] = useState(pageVisible);
  useEffect(() => {
    const sync = () => setVisible(pageVisible());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const now = useSecondTick(visible);
  return (
    <p className="panel-clock">
      <span className="panel-label">{clock.label}</span>
      <span className="panel-time">{formatWallClock(now)}</span>
    </p>
  );
}
