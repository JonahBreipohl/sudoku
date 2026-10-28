import { useEffect, useId, useRef, useState } from "react";
import { getEngineClient } from "../../workers/client";
import type { ImportResult } from "../../workers/protocol";
import { IMPORT_ERRORS, type ImportFailure } from "../shareCopy";
import { importDialog as copy } from "../strings";

export type ImportedPuzzle = Extract<ImportResult, { ok: true }>;

interface ImportDialogProps {
  onImport: (puzzle: ImportedPuzzle) => void;
  onCancel: () => void;
  /** Test seam; defaults to the shared worker client. */
  check?: (text: string) => Promise<ImportResult>;
}

/**
 * Paste an 81-char string, nine lines, or a link. Validation and grading run in the worker; the
 * game only starts once the puzzle graded, and a failure shows the codec's specific reason.
 */
export function ImportDialog({ onImport, onCancel, check }: ImportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<ImportFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    input.current?.focus();
    return () => dialog.close();
  }, []);
  const submit = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    (check ?? ((t) => getEngineClient().importPuzzle(t)))(text)
      .then((r) => {
        if (r.ok) onImport(r);
        else {
          setError(r.reason);
          input.current?.focus();
        }
      })
      .catch(() => setError("worker"))
      .finally(() => setBusy(false));
  };
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id={titleId} className="dialog-title">
          {copy.title}
        </h2>
        <label htmlFor={fieldId} className="share-label">
          {copy.field}
        </label>
        <textarea
          ref={input}
          id={fieldId}
          className="share-input import-input"
          rows={4}
          spellCheck={false}
          autoComplete="off"
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        <p id={errorId} role="alert" className="import-error">
          {error && (
            <>
              <span aria-hidden="true">⚠ </span>
              {IMPORT_ERRORS[error]}
            </>
          )}
        </p>
        <div className="dialog-actions">
          <button type="button" className="ctl" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="ctl dialog-confirm" aria-disabled={busy || text.trim() === ""}>
            {busy ? copy.checking : copy.submit}
          </button>
        </div>
      </form>
    </dialog>
  );
}
