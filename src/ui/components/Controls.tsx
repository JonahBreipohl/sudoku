import type { ReactNode } from "react";
import { controls as t } from "../strings";

interface ControlsProps {
  canUndo: boolean;
  onUndo: () => void;
  onCheck: () => void;
  /** The game is finished, so the board is locked. */
  submitted: boolean;
  /** Only offered on Easy. */
  hintButton?: ReactNode;
}

/** Undo, Check and (on Easy) Hint. The Check result shows on its own line under the toolbar. */
export function Controls({ canUndo, onUndo, onCheck, submitted, hintButton }: ControlsProps) {
  return (
    <div className="controls" role="group" aria-label={t.group}>
      <button type="button" className="ctl" disabled={!canUndo || submitted} onClick={onUndo} aria-keyshortcuts="Control+Z">
        <span aria-hidden="true">↶</span> {t.undo}
      </button>
      <button type="button" className="ctl" disabled={submitted} onClick={onCheck}>
        <span aria-hidden="true">✓</span> {t.check}
      </button>
      {hintButton}
    </div>
  );
}
