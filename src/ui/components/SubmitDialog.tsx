import { useEffect, useId, useRef } from "react";
import { common, newGame, submitDialog as t } from "../strings";

interface SubmitDialogProps {
  result: "solved" | "incorrect";
  wrong: number;
  blank: number;
  onClose: () => void;
  /** Absent until analysis is wired (M7-07); the button then shows as unavailable. */
  onAnalyze?: () => void;
  /** Offered after a solve so the player can keep going; closes this dialog and opens the picker. */
  onNewGame?: () => void;
}

/** Plain-text summary of an incorrect submission; counts only, never which digits are right. */
export function submitSummary(wrong: number, blank: number): string {
  const parts: string[] = [];
  if (wrong > 0) parts.push(wrong === 1 ? "1 error" : `${wrong} errors`);
  if (blank > 0) parts.push(blank === 1 ? "1 empty cell" : `${blank} empty cells`);
  return parts.join(" and ");
}

/** Result screen shown after a submit. The record is already final; closing only reveals the board. */
export function SubmitDialog({ result, wrong, blank, onClose, onAnalyze, onNewGame }: SubmitDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    closeRef.current?.focus();
    return () => dialog.close();
  }, []);
  const solved = result === "solved";
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        <span aria-hidden="true">{solved ? "✓ " : "✕ "}</span>
        {solved ? t.solved : t.notSolved}
      </h2>
      <p id={messageId} className="dialog-message">
        {solved ? t.solvedMessage : t.incorrectMessage(submitSummary(wrong, blank))}
      </p>
      <div className="dialog-actions">
        {!solved && (
          <button type="button" className="ctl" disabled={!onAnalyze} onClick={onAnalyze}>
            {t.analyze}
          </button>
        )}
        {solved && onNewGame && (
          <button type="button" className="ctl" onClick={onNewGame}>
            {newGame.button}
          </button>
        )}
        <button ref={closeRef} type="button" className="ctl dialog-confirm" onClick={onClose}>
          {common.close}
        </button>
      </div>
    </dialog>
  );
}
