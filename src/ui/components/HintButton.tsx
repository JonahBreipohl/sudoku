import type { Hint } from "../../analysis/hints";
import type { HintTier } from "../../state/events";
import { hint as t } from "../strings";

const TIER_NUMBER: Record<HintTier, number> = { nudge: 1, technique: 2, reveal: 3 };

interface HintButtonProps {
  busy: boolean;
  disabled: boolean;
  /** The tier the next press asks for; null once the answer is showing. */
  next: HintTier | null;
  onHint: () => void;
}

/** Says what the next press gives: a hint, more help, or the answer. Escalation lives in the caller. */
export function HintButton({ busy, disabled, next, onHint }: HintButtonProps) {
  return (
    <button
      type="button"
      className="ctl"
      disabled={disabled || busy || next === null}
      aria-busy={busy}
      onClick={onHint}
      aria-keyshortcuts="Shift+H"
    >
      {t.label[next ?? "reveal"]}
    </button>
  );
}

/** The current hint: which of the three it is, its text, Fill it in on a reveal, and a close button. */
export function HintPanel({
  hint,
  canApply,
  onApply,
  onClose,
}: {
  hint: Hint;
  canApply: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="hint-panel" role="group" aria-label={t.panel} data-tier={hint.tier}>
      <div className="hint-panel__body">
        <p className="hint-panel__step">{t.step(TIER_NUMBER[hint.tier])}</p>
        <p className="hint-panel__text">{hint.text}</p>
      </div>
      {hint.tier === "reveal" && hint.placement && canApply && (
        <button type="button" className="ctl hint-panel__apply" onClick={onApply}>
          {t.apply}
        </button>
      )}
      <button type="button" className="ctl hint-panel__close" aria-label={t.close} onClick={onClose}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
