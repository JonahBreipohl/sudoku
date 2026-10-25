import { useEffect, useRef, useState } from "react";
import { checkMessage } from "../../state/check";
import { ConfirmDialog } from "./ConfirmDialog";

interface ControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  notesMode: boolean;
  /** True while Shift is held, which acts as notes mode without changing the toggle. */
  shiftHeld: boolean;
  autoCandidates: boolean;
  onToggleNotes: () => void;
  onAutoNotes: () => void;
  onToggleAuto: () => void;
  onPause: () => void;
  paused: boolean;
  digitFirst: boolean;
  onToggleEntry: () => void;
  onCheck: () => void;
  /** Result of the last Check while the board is unchanged, else null. */
  checkResult: { mistakes: number } | null;
}

export function Controls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  notesMode,
  shiftHeld,
  autoCandidates,
  onToggleNotes,
  onAutoNotes,
  onToggleAuto,
  onPause,
  paused,
  digitFirst,
  onToggleEntry,
  onCheck,
  checkResult,
}: ControlsProps) {
  const active = notesMode || shiftHeld;
  const [confirming, setConfirming] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  // The modal keeps the page inert until unmounted, so focus returns only after it closes.
  useEffect(() => {
    if (wasConfirming.current && !confirming) resetButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  if (paused) return null;
  return (
    <div className="controls" role="group" aria-label="Game controls">
      <button type="button" className="ctl" disabled={!canUndo} onClick={onUndo} aria-keyshortcuts="Control+Z">
        <span aria-hidden="true">↶</span> Undo
      </button>
      <button type="button" className="ctl" disabled={!canRedo} onClick={onRedo} aria-keyshortcuts="Control+Shift+Z">
        <span aria-hidden="true">↷</span> Redo
      </button>
      <button ref={resetButton} type="button" className="ctl" disabled={!canUndo} aria-haspopup="dialog" onClick={() => setConfirming(true)}>
        <span aria-hidden="true">⟲</span> Reset
      </button>
      <button type="button" className="ctl" onClick={onPause} aria-keyshortcuts="P">
        <span aria-hidden="true">❚❚</span> Pause
      </button>
      <button
        type="button"
        className={active ? "ctl ctl--on" : "ctl"}
        aria-pressed={notesMode}
        onClick={onToggleNotes}
        aria-keyshortcuts="N"
      >
        <span aria-hidden="true">{active ? "✎" : "○"}</span> Notes: {active ? "On" : "Off"}
        {shiftHeld && !notesMode ? " (Shift)" : ""}
      </button>
      <button type="button" className={digitFirst ? "ctl ctl--on" : "ctl"} aria-pressed={digitFirst} onClick={onToggleEntry}>
        <span aria-hidden="true">{digitFirst ? "◉" : "○"}</span> Digit-first: {digitFirst ? "On" : "Off"}
      </button>
      <button type="button" className="ctl" onClick={onAutoNotes}>
        Fill notes
      </button>
      <button type="button" className={autoCandidates ? "ctl ctl--on" : "ctl"} aria-pressed={autoCandidates} onClick={onToggleAuto}>
        <span aria-hidden="true">{autoCandidates ? "☑" : "☐"}</span> Auto-candidates: {autoCandidates ? "On" : "Off"}
      </button>
      <button type="button" className="ctl" onClick={onCheck}>
        <span aria-hidden="true">?</span> Check
      </button>
      <div role="status" className={checkResult ? (checkResult.mistakes === 0 ? "check-status check-status--ok" : "check-status check-status--bad") : "check-status"}>
        {checkResult ? checkMessage(checkResult.mistakes) : ""}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Reset this puzzle?"
          message="This clears every digit and note back to the givens. You can undo the reset afterwards."
          confirmLabel="Reset"
          cancelLabel="Keep playing"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onReset();
          }}
        />
      )}
    </div>
  );
}
