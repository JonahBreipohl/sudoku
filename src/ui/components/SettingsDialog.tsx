import { useEffect, useId, useRef } from "react";
import type { Settings } from "../../state/settings";
import { common, settings as t } from "../strings";
import { SpotifySettings } from "../spotify/SpotifySettings";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

/**
 * Display mode's settings on the native <dialog>: the Spotify card's setup, which Display needs and
 * Play does not. Changes apply immediately, so there is only a Close button.
 */
export function SettingsDialog({ settings, onChange, onClose }: Props) {
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
        {t.title}
      </h2>
      <SpotifySettings settings={settings} onChange={onChange} />
      <div className="dialog-actions">
        <button type="button" className="ctl dialog-confirm" autoFocus onClick={onClose}>
          {common.close}
        </button>
      </div>
    </dialog>
  );
}
