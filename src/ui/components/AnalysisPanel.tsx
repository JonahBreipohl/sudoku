import { forwardRef } from "react";
import { cellName } from "../../engine";
import type { BoardEvent } from "../../state/events";
import type { AnalysisState } from "../useAnalysis";
import { Timeline } from "./Timeline";
import {
  describeAlternative,
  describeCascade,
  describeDiagnosis,
  describeMistake,
  describeStall,
  solveSummary,
} from "../analysisCopy";

interface AnalysisPanelProps {
  state: AnalysisState;
  onClose: () => void;
  onRetry?: () => void;
  /** The path to step through; the timeline is hidden without one. */
  path?: readonly BoardEvent[];
  step?: number;
  onStep?: (step: number) => void;
}

/** Report for a submitted game: the root mistake and its context, or the solve breakdown. */
export const AnalysisPanel = forwardRef<HTMLElement, AnalysisPanelProps>(function AnalysisPanel(
  { state, onClose, onRetry, path, step, onStep },
  ref,
) {
  return (
    <section ref={ref} tabIndex={-1} className="analysis" aria-label="Analysis" data-analysis>
      <div className="analysis-head">
        <h2 className="analysis-title">Analysis</h2>
        <button type="button" className="ctl" onClick={onClose}>
          Close analysis
        </button>
      </div>
      <Body state={state} onRetry={onRetry} />
      {state.status === "ready" && path && path.length > 0 && onStep && (
        <>
          <h3 className="analysis-sub">Timeline</h3>
          <Timeline
            path={path}
            step={step ?? path.length}
            rootIndex={state.result.mistakes.root?.mistake.index ?? null}
            onStep={onStep}
          />
        </>
      )}
    </section>
  );
});

function Body({ state, onRetry }: { state: AnalysisState; onRetry?: () => void }) {
  if (state.status === "idle" || state.status === "loading")
    return (
      <p className="analysis-note" role="status">
        Analysing your game…
      </p>
    );
  if (state.status === "error")
    return (
      <div role="alert">
        <p className="analysis-note">{state.message}</p>
        {onRetry && (
          <button type="button" className="ctl" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  const { mistakes: m, solve } = state.result;
  if (!m.root) {
    return (
      <>
        <p className="analysis-lead">
          <span aria-hidden="true">✓ </span>No mistakes on this path.
        </p>
        <dl className="analysis-facts">
          {solveSummary(solve).map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {solve.stalls.length > 0 && (
          <>
            <h3 className="analysis-sub">Longest pauses in thinking</h3>
            <ol className="analysis-list">
              {solve.stalls.map((s) => (
                <li key={s.beforeId}>{describeStall(s)}</li>
              ))}
            </ol>
          </>
        )}
      </>
    );
  }
  const support = m.highlight.slice(1);
  return (
    <>
      <p className="analysis-lead">
        <span aria-hidden="true">! </span>
        First mistake: {cellName(m.root.mistake.cell)}
      </p>
      <p>{describeMistake(m.root.mistake)}</p>
      <p>{describeDiagnosis(m.root)}</p>
      <p className="analysis-key">
        <span className="key-swatch key-swatch--root" aria-hidden="true" /> Mistake cell (solid frame, “!”)
        {support.length > 0 && (
          <>
            {" "}
            <span className="key-swatch key-swatch--support" aria-hidden="true" /> Reason cells: {support.map(cellName).join(", ")}{" "}
            (dashed frame, “◆”)
          </>
        )}
      </p>
      <h3 className="analysis-sub">What you could have done</h3>
      <p>{describeAlternative(m.alternative)}</p>
      {m.cascade.length > 0 && (
        <>
          <h3 className="analysis-sub">What it led to</h3>
          <ol className="analysis-list">
            {m.cascade.map((c) => (
              <li key={c.eventId}>You {describeCascade(c)}</li>
            ))}
          </ol>
        </>
      )}
      {m.mistakes.length > 1 && (
        <p className="analysis-note">
          {m.mistakes.length} mistakes in total; later ones often follow from the first.
        </p>
      )}
    </>
  );
}
