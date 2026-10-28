import { useEffect, useId, useRef, useState } from "react";
import { dailyLevel } from "../../state/daily";
import { LEVELS, type Level } from "../../engine/step";

interface NewGameDialogProps {
  onStart: (level: Level) => void;
  onDaily: () => void;
  /** Today's daily is already solved; offering it again would restart a finished puzzle. */
  dailySolved?: boolean;
  onCancel: () => void;
}

export const levelLabel = (l: Level) => l[0]!.toUpperCase() + l.slice(1);

/**
 * Modal difficulty picker on the native <dialog> (same focus and Escape behavior as ConfirmDialog).
 * Radios rather than a select so all five levels are visible and arrow keys move between them.
 */
export function NewGameDialog({ onStart, onDaily, dailySolved = false, onCancel }: NewGameDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [level, setLevel] = useState<Level>("easy");
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        Choose a difficulty
      </h2>
      {dailySolved ? (
        <button type="button" className="ctl daily-start" aria-disabled="true" data-daily-solved>
          <span aria-hidden="true">✓ </span>
          Daily puzzle solved today. Next one tomorrow.
        </button>
      ) : (
        <button type="button" className="ctl daily-start" onClick={onDaily}>
          <span aria-hidden="true">★ </span>
          Daily puzzle ({levelLabel(dailyLevel(new Date()))} today)
        </button>
      )}
      <fieldset className="level-list">
        <legend className="sr-only">Difficulty</legend>
        {LEVELS.map((l) => (
          <label key={l} className={l === level ? "level-option level-option--on" : "level-option"}>
            <input type="radio" name="level" value={l} checked={l === level} onChange={() => setLevel(l)} />
            <span>{levelLabel(l)}</span>
          </label>
        ))}
      </fieldset>
      <div className="dialog-actions">
        <button type="button" className="ctl" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="ctl dialog-confirm" onClick={() => onStart(level)}>
          Start game
        </button>
      </div>
    </dialog>
  );
}
