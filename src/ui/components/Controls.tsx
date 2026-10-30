import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { checkMessage } from "../../state/check";
import { ConfirmDialog } from "./ConfirmDialog";
import { common, controls as t } from "../strings";

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
  onSubmit: () => void;
  submitted: boolean;
  /** Reopens the result dialog after it was dismissed. */
  onViewResult: () => void;
  resultOpen: boolean;
  /** Result of the last Check while the board is unchanged, else null. */
  checkResult: { mistakes: number } | null;
  hintButton: ReactNode;
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
  onSubmit,
  submitted,
  onViewResult,
  resultOpen,
  checkResult,
  hintButton,
}: ControlsProps) {
  const active = notesMode || shiftHeld;
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  // The modal keeps the page inert until unmounted, so focus returns only after it closes.
  useEffect(() => {
    if (wasConfirming.current && !confirming) resetButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const resultButton = useRef<HTMLButtonElement>(null);
  const wasResultOpen = useRef(resultOpen);
  // The result dialog is modal, so focus would otherwise fall to <body> on close.
  useEffect(() => {
    if (wasResultOpen.current && !resultOpen) resultButton.current?.focus();
    wasResultOpen.current = resultOpen;
  }, [resultOpen]);
  if (paused) return null;
  return (
    <div className="controls" role="group" aria-label={t.group}>
      <button type="button" className="ctl" disabled={!canUndo || submitted} onClick={onUndo} aria-keyshortcuts="Control+Z">
        <span aria-hidden="true">↶</span> {t.undo}
      </button>
      <button type="button" className="ctl" disabled={!canRedo || submitted} onClick={onRedo} aria-keyshortcuts="Control+Shift+Z">
        <span aria-hidden="true">↷</span> {t.redo}
      </button>
      <button ref={resetButton} type="button" className="ctl" disabled={!canUndo || submitted} aria-haspopup="dialog" onClick={() => setConfirming(true)}>
        <span aria-hidden="true">⟲</span> {t.reset}
      </button>
      <button type="button" className="ctl" onClick={onPause} aria-keyshortcuts="P">
        <span aria-hidden="true">❚❚</span> {t.pause}
      </button>
      <button
        type="button"
        className={active ? "ctl ctl--on" : "ctl"}
        aria-pressed={notesMode}
        onClick={onToggleNotes}
        aria-keyshortcuts="N"
      >
        <span aria-hidden="true">{active ? "✎" : "○"}</span> {t.notes} {active ? common.on : common.off}
        {shiftHeld && !notesMode ? t.shiftSuffix : ""}
      </button>
      <button type="button" className={digitFirst ? "ctl ctl--on" : "ctl"} aria-pressed={digitFirst} onClick={onToggleEntry}>
        <span aria-hidden="true">{digitFirst ? "◉" : "○"}</span> {t.digitFirst} {digitFirst ? common.on : common.off}
      </button>
      <button type="button" className="ctl" onClick={onAutoNotes}>
        {t.fillNotes}
      </button>
      <button type="button" className={autoCandidates ? "ctl ctl--on" : "ctl"} aria-pressed={autoCandidates} onClick={onToggleAuto}>
        <span aria-hidden="true">{autoCandidates ? "☑" : "☐"}</span> {t.autoCandidates} {autoCandidates ? common.on : common.off}
      </button>
      <button type="button" className="ctl" onClick={onCheck}>
        {t.check}
      </button>
      {hintButton}
      {submitted ? (
        <button ref={resultButton} type="button" className="ctl" aria-haspopup="dialog" onClick={onViewResult}>
          <span aria-hidden="true">✓</span> {t.viewResult}
        </button>
      ) : (
        <button type="button" className="ctl" aria-haspopup="dialog" onClick={() => setSubmitting(true)}>
          <span aria-hidden="true">✓</span> {t.submit}
        </button>
      )}
      <div role="status" className={checkResult ? (checkResult.mistakes === 0 ? "check-status check-status--ok" : "check-status check-status--bad") : "check-status"}>
        {checkResult ? checkMessage(checkResult.mistakes) : ""}
      </div>
      {submitting && (
        <ConfirmDialog
          title={t.submitTitle}
          message={t.submitMessage}
          confirmLabel={t.submit}
          cancelLabel={common.keepPlaying}
          onCancel={() => setSubmitting(false)}
          onConfirm={() => {
            setSubmitting(false);
            onSubmit();
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t.resetTitle}
          message={t.resetMessage}
          confirmLabel={t.resetConfirm}
          cancelLabel={common.keepPlaying}
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
