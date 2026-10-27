import { useMemo } from "react";
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
  const none = "–";
  const items: [string, string][] = [
    ["Solved today", String(stats.solved)],
    ["Total time", stats.solved ? formatElapsed(stats.totalMs) : none],
    ["Best time", stats.bestMs === null ? none : formatElapsed(stats.bestMs)],
    ["Streak", `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`],
  ];
  return (
    <section className="display-stats" aria-label="Today's stats">
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
