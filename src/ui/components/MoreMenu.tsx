import { useEffect, useRef, useState } from "react";
import { app } from "../strings";

export interface MoreItem {
  label: string;
  /** Plain same-tab link instead of an action. */
  href?: string;
  onSelect?: () => void;
  dialog?: boolean;
  disabled?: boolean;
}

/** Disclosure menu for header actions that don't fit a phone-width header (shown by CSS only there). */
export function MoreMenu({ items }: { items: MoreItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="more" ref={root}>
      <button
        ref={button}
        type="button"
        className="ctl more-button"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {app.more}
        <span aria-hidden="true"> {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul id="more-menu" className="more-menu" aria-label={app.moreMenuLabel}>
          {items.map((it) => (
            <li key={it.label}>
              {it.href ? (
                <a className="ctl more-item more-link" href={it.href}>
                  {it.label}
                </a>
              ) : (
              <button
                type="button"
                className="ctl more-item"
                aria-haspopup={it.dialog ? "dialog" : undefined}
                disabled={it.disabled}
                onClick={() => {
                  // Dialogs restore focus to the last focused element; the menu item is about to unmount.
                  button.current?.focus();
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
