import { useMemo } from "react";
import type { BoardEvent } from "../../state/events";
import { historyEntries } from "../moveHistory";

export function MoveHistory({ nodes, cursor }: { nodes: readonly BoardEvent[]; cursor: number }) {
  const entries = useMemo(() => historyEntries(nodes, cursor), [nodes, cursor]);
  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="panel-title">
        Moves
      </h2>
      {/* Focusable so keyboard users can scroll a long list. */}
      <div className="history-scroll" tabIndex={0} role="region" aria-label="Move history, newest first">
        {entries.length === 0 ? (
          <p className="history-empty">No moves yet.</p>
        ) : (
          <ol className="history-list">
            {entries.map((e) => (
              <li
                key={e.id}
                className={`history-item${e.undone ? " history-item--undone" : ""}${e.current ? " history-item--current" : ""}`}
                aria-current={e.current ? "step" : undefined}
              >
                <span className="history-step">{e.step}.</span>
                <span className="history-text">{e.text}</span>
                {e.undone && <span className="history-tag">undone</span>}
                {e.current && <span className="history-tag">now</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
