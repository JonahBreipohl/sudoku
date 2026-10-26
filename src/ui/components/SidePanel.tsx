import { activeMs } from "../../state/timer";
import type { GameRecord } from "../../state/events";
import { formatElapsed, formatWallClock } from "../clock";
import { useTick } from "../useTick";
import { MoveHistory } from "./MoveHistory";

interface SidePanelProps {
  record: GameRecord;
  showTimer: boolean;
  wallClock: boolean;
}

/** Tablet and desktop only (CSS hides it on phones, which also removes it from the tab order). */
export function SidePanel({ record, showTimer, wallClock }: SidePanelProps) {
  const now = useTick(showTimer || wallClock);
  return (
    <aside className="side-panel" aria-label="Game info">
      {(showTimer || wallClock) && (
        <div className="panel-clocks">
          {showTimer && (
            <p className="panel-clock">
              <span className="panel-label">Time</span>
              <span className="panel-time" role="timer" aria-label="Elapsed time">
                {formatElapsed(activeMs(record, now))}
              </span>
            </p>
          )}
          {wallClock && (
            <p className="panel-clock">
              <span className="panel-label">Clock</span>
              <span className="panel-time">{formatWallClock(now)}</span>
            </p>
          )}
        </div>
      )}
      <MoveHistory nodes={record.nodes} cursor={record.cursor} />
    </aside>
  );
}
