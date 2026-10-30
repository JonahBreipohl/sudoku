import type { Hint } from "../../analysis/hints";
import { hint as t } from "../strings";

interface HintButtonProps {
  busy: boolean;
  disabled: boolean;
  onHint: () => void;
}

/** The button sits in the controls row; escalation lives in the caller. */
export function HintButton({ busy, disabled, onHint }: HintButtonProps) {
  return (
    <button type="button" className="ctl" disabled={disabled || busy} onClick={onHint} aria-keyshortcuts="Shift+H">
      {t.button}
    </button>
  );
}

/** The current hint's text, with Apply once a reveal places a digit. */
export function HintPanel({ hint, canApply, onApply }: { hint: Hint; canApply: boolean; onApply: () => void }) {
  return (
    <div className="hint-panel" role="group" aria-label={t.panel} data-tier={hint.tier}>
      <p className="hint-panel__text">{hint.text}</p>
      {hint.tier === "reveal" && hint.placement && canApply && (
        <button type="button" className="ctl" onClick={onApply}>
          {t.apply}
        </button>
      )}
    </div>
  );
}
