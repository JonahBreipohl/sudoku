import { useEffect, useId, useRef } from "react";
import { SHORTCUT_GROUPS } from "../keyboard";

/**
 * Keyboard reference on the native <dialog>: showModal() makes the page inert and traps focus,
 * and Escape raises `cancel`. Focus returns to whatever held it before the dialog opened.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        Keyboard shortcuts
      </h2>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="shortcuts-group">
          <h3 className="shortcuts-heading">{group.title}</h3>
          <dl className="shortcuts-list">
            {group.items.map((item) => (
              <div key={item.label} className="shortcuts-row">
                <dt>
                  {item.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="dialog-actions">
        <button type="button" className="ctl dialog-confirm" autoFocus onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
