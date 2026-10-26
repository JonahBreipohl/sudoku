import type { BoardEvent } from "../../state/events";
import { clampStep, mistakeStep, stepLabel } from "../timeline";

interface TimelineProps {
  path: readonly BoardEvent[];
  /** Step being previewed; path.length means the real, current position. */
  step: number;
  /** Index on the path of the root mistake, if any. */
  rootIndex: number | null;
  onStep: (step: number) => void;
}

/** Read-only stepper over the path; it only reports which step to preview. */
export function Timeline({ path, step, rootIndex, onStep }: TimelineProps) {
  const n = path.length;
  const s = clampStep(step, n);
  const root = mistakeStep(rootIndex, n);
  const label = stepLabel(path, s);
  const go = (to: number) => onStep(clampStep(to, n));
  return (
    <div className="timeline" role="group" aria-label="Move timeline">
      <p className="timeline-label" role="status" data-testid="timeline-label">
        {label}
        {s === n ? " (now)" : ""}
      </p>
      <div className="timeline-row">
        <button type="button" className="ctl" disabled={s === 0} onClick={() => go(0)}>
          Start
        </button>
        <button type="button" className="ctl" disabled={s === 0} onClick={() => go(s - 1)}>
          Previous move
        </button>
        <button type="button" className="ctl" disabled={s === n} onClick={() => go(s + 1)}>
          Next move
        </button>
      </div>
      <input
        type="range"
        className="timeline-slider"
        aria-label="Move"
        aria-valuetext={label}
        min={0}
        max={n}
        step={1}
        value={s}
        onChange={(e) => go(Number(e.target.value))}
      />
      <div className="timeline-row">
        {root !== null && (
          <button type="button" className="ctl" disabled={s === root} onClick={() => go(root)}>
            Jump to mistake
          </button>
        )}
        <button type="button" className="ctl" disabled={s === n} onClick={() => go(n)}>
          Back to now
        </button>
      </div>
    </div>
  );
}
