import { useMemo } from "react";
import type { BoardEvent } from "../../state/events";
import { history } from "../strings";
import { branchesAtStart, historyEntries } from "../moveHistory";

export function MoveHistory({ nodes, cursor }: { nodes: readonly BoardEvent[]; cursor: number }) {
  const entries = useMemo(() => historyEntries(nodes, cursor), [nodes, cursor]);
  const atStart = useMemo(() => branchesAtStart(nodes), [nodes]);
  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="panel-title">
        {history.title}
      </h2>
      {/* Focusable so keyboard users can scroll a long list. */}
      <div className="history-scroll" tabIndex={0} role="region" aria-label={history.scroll}>
        {entries.length === 0 ? (
          <p className="history-empty">{history.empty}</p>
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
                {e.undone && <span className="history-tag">{history.undone}</span>}
                {e.current && <span className="history-tag">{history.now}</span>}
                {e.branchPoint && (
                  <span className="history-tag" data-testid="branch-point">
                    {history.branchPoint}
                  </span>
                )}
              </li>
            ))}
            {atStart && (
              <li className="history-item">
                <span className="history-text">{history.start}</span>
                <span className="history-tag" data-testid="branch-point">
                  {history.branchPoint}
                </span>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
