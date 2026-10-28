import { useEffect, useId, useRef, useState } from "react";
import { copyText, type CopyOutcome } from "../shareCopy";

interface ShareDialogProps {
  /** 81-char puzzle string. */
  puzzle: string;
  url: string;
  onClose: () => void;
}

function CopyRow({ label, value, onStatus }: { label: string; value: string; onStatus: (s: string) => void }) {
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="share-row">
      <label htmlFor={id} className="share-label">
        {label}
      </label>
      <div className="share-field">
        <input ref={field} id={id} className="share-input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="ctl"
          onClick={() =>
            void copyText(value, field.current).then((o: CopyOutcome) =>
              onStatus(
                o === "copied"
                  ? `${label} copied.`
                  : `Copy was blocked. The ${label.toLowerCase()} is selected: press Ctrl+C (Cmd+C on Mac).`,
              ),
            )
          }
        >
          Copy<span className="sr-only"> {label.toLowerCase()}</span>
        </button>
      </div>
    </div>
  );
}

/** Shows the current puzzle as an 81-char string and a link, each with a Copy button. */
export function ShareDialog({ puzzle, url, onClose }: ShareDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [status, setStatus] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>(".share-input")?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        Share this puzzle
      </h2>
      <CopyRow label="Puzzle string" value={puzzle} onStatus={setStatus} />
      <CopyRow label="Link" value={url} onStatus={setStatus} />
      <p role="status" className="share-status">
        {status}
      </p>
      <div className="dialog-actions">
        <button type="button" className="ctl dialog-confirm" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
