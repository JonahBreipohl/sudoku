import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation on the native <dialog>: showModal() makes the page inert and traps focus,
 * and Escape raises `cancel`. Focus starts on the safe choice so Enter never destroys work.
 * The caller owns returning focus to the control that opened it.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(e) => {
        // Keep the dialog open until the parent unmounts it, so state and DOM agree.
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <p id={messageId} className="dialog-message">
        {message}
      </p>
      <div className="dialog-actions">
        <button ref={cancelRef} type="button" className="ctl" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="ctl dialog-confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
