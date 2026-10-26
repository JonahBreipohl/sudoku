import { useMemo } from "react";
import type { BoardEvent } from "../../state/events";
import { branchesAtStart, historyEntries } from "../moveHistory";

export function MoveHistory({ nodes, cursor }: { nodes: readonly BoardEvent[]; cursor: number }) {
  const entries = useMemo(() => historyEntries(nodes, cursor), [nodes, cursor]);
  const atStart = useMemo(() => branchesAtStart(nodes), [nodes]);
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
                {e.branchPoint && (
                  <span className="history-tag" data-testid="branch-point">
                    branch point
                  </span>
                )}
              </li>
            ))}
            {atStart && (
              <li className="history-item">
                <span className="history-text">Start</span>
                <span className="history-tag" data-testid="branch-point">
                  branch point
                </span>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
