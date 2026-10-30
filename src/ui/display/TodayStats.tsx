import { useMemo } from "react";
import { display } from "../strings";
import { createLocalStoragePersistence } from "../../state/persistence";
import { todayStats } from "../../state/today";
import { formatElapsed } from "../clock";
import { useGame } from "../useGame";

const persistence = createLocalStoragePersistence();

/** Today's solves from the archive. Re-read when the minute turns or the live game changes. */
export function TodayStats({ now }: { now: number }) {
  const { game } = useGame();
  const status = game.record.status;
  const minute = Math.floor(now / 60_000);
  const stats = useMemo(
    () => todayStats(persistence.list(), minute * 60_000),
    // `status` flips to submitted when a solve is archived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, status],
  );
  const items: [string, string][] = [
    [display.solvedToday, String(stats.solved)],
    [display.totalTime, stats.solved ? formatElapsed(stats.totalMs) : display.none],
    [display.bestTime, stats.bestMs === null ? display.none : formatElapsed(stats.bestMs)],
    [display.streak, `${stats.streak} ${stats.streak === 1 ? display.day : display.days}`],
  ];
  return (
    <section className="display-stats" aria-label={display.statsLabel}>
      <dl>
        {items.map(([label, value]) => (
          <div key={label} className="display-stat">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
