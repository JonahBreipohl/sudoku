import { forwardRef } from "react";
import { cellName } from "../../engine";
import type { BoardEvent } from "../../state/events";
import type { AnalysisState } from "../useAnalysis";
import { clampStep } from "../timeline";
import { Timeline } from "./Timeline";
import { analysis } from "../strings";
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
  /** Rewinds the game to `step` (a count of path events) and resumes play from there. */
  onRewind?: (step: number) => void;
}

/** Report for a submitted game: the root mistake and its context, or the solve breakdown. */
export const AnalysisPanel = forwardRef<HTMLElement, AnalysisPanelProps>(function AnalysisPanel(
  { state, onClose, onRetry, path, step, onStep, onRewind },
  ref,
) {
  return (
    <section ref={ref} tabIndex={-1} className="analysis" aria-label={analysis.label} data-analysis>
      <div className="analysis-head">
        <h2 className="analysis-title">{analysis.title}</h2>
        <button type="button" className="ctl" onClick={onClose}>
          {analysis.close}
        </button>
      </div>
      <Body state={state} onRetry={onRetry} />
      {state.status === "ready" && path && path.length > 0 && onStep && (
        <>
          <h3 className="analysis-sub">{analysis.timeline}</h3>
          <Timeline
            path={path}
            step={step ?? path.length}
            rootIndex={state.result.mistakes.root?.mistake.index ?? null}
            onStep={onStep}
          />
          {onRewind && (
            <RewindActions
              length={path.length}
              step={step ?? path.length}
              rootIndex={state.result.mistakes.root?.mistake.index ?? null}
              onRewind={onRewind}
            />
          )}
        </>
      )}
    </section>
  );
});

function RewindActions({
  length,
  step,
  rootIndex,
  onRewind,
}: {
  length: number;
  step: number;
  rootIndex: number | null;
  onRewind: (step: number) => void;
}) {
  const s = clampStep(step, length);
  // Just before the root mistake is the step that leaves the mistaken move out.
  const before = rootIndex !== null && rootIndex >= 0 && rootIndex < length ? rootIndex : null;
  return (
    <div className="timeline-row" role="group" aria-label={analysis.rewindGroup}>
      {before !== null && (
        <button type="button" className="ctl" data-testid="rewind-before-mistake" onClick={() => onRewind(before)}>
          {analysis.rewindBefore}
        </button>
      )}
      <button
        type="button"
        className="ctl"
        data-testid="rewind-here"
        disabled={s >= length}
        onClick={() => onRewind(s)}
      >
        {analysis.rewindHere}
      </button>
    </div>
  );
}

function Body({ state, onRetry }: { state: AnalysisState; onRetry?: () => void }) {
  if (state.status === "idle" || state.status === "loading")
    return (
      <p className="analysis-note" role="status">
        {analysis.analysing}
      </p>
    );
  if (state.status === "error")
    return (
      <div role="alert">
        <p className="analysis-note">{state.message}</p>
        {onRetry && (
          <button type="button" className="ctl" onClick={onRetry}>
            {analysis.retry}
          </button>
        )}
      </div>
    );
  const { mistakes: m, solve } = state.result;
  if (!m.root) {
    return (
      <>
        <p className="analysis-lead">
          <span aria-hidden="true">{analysis.checkMark}</span>{analysis.noMistakes}
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
            <h3 className="analysis-sub">{analysis.pauses}</h3>
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
        <span aria-hidden="true">{analysis.mistakeMark}</span>
        {analysis.firstMistake(cellName(m.root.mistake.cell))}
      </p>
      <p>{describeMistake(m.root.mistake)}</p>
      <p>{describeDiagnosis(m.root)}</p>
      <p className="analysis-key">
        <span className="key-swatch key-swatch--root" aria-hidden="true" /> {analysis.keyRoot}
        {support.length > 0 && (
          <>
            {" "}
            <span className="key-swatch key-swatch--support" aria-hidden="true" /> {analysis.keyReasonCells(support.map(cellName).join(", "))}{" "}
            {analysis.keyReasonFrame}
          </>
        )}
      </p>
      <h3 className="analysis-sub">{analysis.couldHaveDone}</h3>
      <p>{describeAlternative(m.alternative)}</p>
      {m.cascade.length > 0 && (
        <>
          <h3 className="analysis-sub">{analysis.ledTo}</h3>
          <ol className="analysis-list">
            {m.cascade.map((c) => (
              <li key={c.eventId}>{analysis.you}{describeCascade(c)}</li>
            ))}
          </ol>
        </>
      )}
      {m.mistakes.length > 1 && (
        <p className="analysis-note">
          {analysis.totalMistakes(m.mistakes.length)}
        </p>
      )}
    </>
  );
}
