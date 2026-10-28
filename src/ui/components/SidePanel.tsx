import { activeMs } from "../../state/timer";
import type { GameRecord } from "../../state/events";
import { formatElapsed } from "../clock";
import { sidePanel } from "../strings";
import { useSecondTick } from "../useSecondTick";
import { MoveHistory } from "./MoveHistory";
import { WallClock } from "./WallClock";

interface SidePanelProps {
  record: GameRecord;
  showTimer: boolean;
  wallClock: boolean;
}

/** Tablet and desktop only (CSS hides it on phones, which also removes it from the tab order). */
export function SidePanel({ record, showTimer, wallClock }: SidePanelProps) {
  const now = useSecondTick(showTimer);
  return (
    <aside className="side-panel" aria-label={sidePanel.label}>
      {(showTimer || wallClock) && (
        <div className="panel-clocks">
          {showTimer && (
            <p className="panel-clock">
              <span className="panel-label">{sidePanel.time}</span>
              <span className="panel-time" role="timer" aria-label={sidePanel.elapsed}>
                {formatElapsed(activeMs(record, now))}
              </span>
            </p>
          )}
          {wallClock && <WallClock />}
        </div>
      )}
      <MoveHistory nodes={record.nodes} cursor={record.cursor} />
    </aside>
  );
}
