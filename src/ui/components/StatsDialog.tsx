import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GameRecord } from "../../state/events";
import { levelStats } from "../../state/stats";
import { formatDuration } from "../analysisCopy";
import { levelLabel } from "./NewGameDialog";

const dash = "None yet";

/**
 * Per-level stats on the native <dialog> (same pattern as ShortcutsDialog). Each level is a
 * section of label/value pairs rather than a table, so it never needs horizontal scroll at
 * phone width.
 */
export function StatsDialog({
  loadArchive,
  onClose,
}: {
  loadArchive: () => GameRecord[];
  onClose: () => void;
}) {
  // Read once per opening, so the numbers match what was archived when the player asked.
  const [{ archive, now }] = useState(() => ({
    archive: loadArchive(),
    now: Date.now(),
  }));
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const stats = useMemo(() => levelStats(archive, now), [archive, now]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        Statistics
      </h2>
      {stats.map((s) => {
        const rows: [string, string][] = [
          ["Solved", String(s.solved)],
          ["Best time", s.bestMs === null ? dash : formatDuration(s.bestMs)],
          [
            "Average time",
            s.averageMs === null ? dash : formatDuration(s.averageMs),
          ],
          ["Streak", s.streak === 1 ? "1 day" : `${s.streak} days`],
          [
            "Games with a mistake",
            s.mistakeRate === null
              ? dash
              : `${Math.round(s.mistakeRate * 100)}% (${s.mistakeGames} of ${s.solved})`,
          ],
        ];
        return (
          <section
            key={s.level}
            className="shortcuts-group"
            data-level={s.level}
          >
            <h3 className="shortcuts-heading">{levelLabel(s.level)}</h3>
            <dl className="shortcuts-list">
              {rows.map(([label, value]) => (
                <div key={label} className="shortcuts-row">
                  <dt className="stats-label">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <div className="dialog-actions">
        <button
          type="button"
          className="ctl dialog-confirm"
          autoFocus
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
