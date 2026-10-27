import type { Hint } from "../../analysis/hints";

const NEXT_LABEL = { nudge: "Hint", technique: "More hint", reveal: "Show answer" } as const;

interface HintButtonProps {
  /** The hint shown for the current board, or null before one was asked for. */
  hint: Hint | null;
  busy: boolean;
  disabled: boolean;
  onHint: () => void;
  onApply: () => void;
}

/** Hint button and the panel for the current hint; escalation lives in the caller. */
export function HintButton({ hint, busy, disabled, onHint, onApply }: HintButtonProps) {
  const label = !hint ? NEXT_LABEL.nudge : hint.tier === "nudge" ? NEXT_LABEL.technique : hint.tier === "technique" ? NEXT_LABEL.reveal : "Hint";
  return (
    <>
      <button type="button" className="ctl" disabled={disabled || busy} onClick={onHint} aria-keyshortcuts="Shift+H">
        <span aria-hidden="true">?</span> {label}
      </button>
      {hint && (
        <div className="hint-panel" role="group" aria-label="Hint" data-tier={hint.tier}>
          <p className="hint-panel__text">{hint.text}</p>
          {hint.tier === "reveal" && hint.placement && !disabled && (
            <button type="button" className="ctl" onClick={onApply}>
              Apply
            </button>
          )}
        </div>
      )}
    </>
  );
}
