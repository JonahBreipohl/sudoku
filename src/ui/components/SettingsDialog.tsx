import { useEffect, useId, useRef } from "react";
import { MAX_IDLE_MINUTES, type Settings } from "../../state/settings";
import { THEME_ORDER } from "../theme";
import { common, settings as t } from "../strings";

type BoolKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const TOGGLES: { key: BoolKey; label: string; hint: string }[] = [
  { key: "autoCandidates", ...t.autoCandidates },
  { key: "checkHighlighting", ...t.checkHighlighting },
  { key: "showTimer", ...t.showTimer },
  { key: "wallClock", ...t.wallClock },
  { key: "leftHanded", ...t.leftHanded },
];

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** Entry mode and auto candidates also reset session state, so the app owns those changes. */
  onToggleEntry: () => void;
  onToggleAuto: () => void;
  onClose: () => void;
}

/**
 * Settings on the native <dialog> (same pattern as ShortcutsDialog). Changes apply
 * immediately, so there is only a Close button. Theme "System" follows the OS live through
 * the prefers-color-scheme media query in styles.css.
 */
export function SettingsDialog({ settings, onChange, onToggleEntry, onToggleAuto, onClose }: Props) {
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

  const toggle = (key: BoolKey) => (key === "autoCandidates" ? onToggleAuto() : onChange({ [key]: !settings[key] }));

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
      <fieldset className="settings-group">
        <legend>{t.theme}</legend>
        <div className="settings-radios">
          {THEME_ORDER.map((th) => (
            <label key={th} className="settings-radio">
              <input
                type="radio"
                name="theme"
                value={th}
                checked={settings.theme === th}
                onChange={() => onChange({ theme: th })}
              />
              <span>{t.themeLabels[th]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="settings-group">
        <legend>{t.entryMode}</legend>
        <div className="settings-radios">
          {(["cell-first", "digit-first"] as const).map((m) => (
            <label key={m} className="settings-radio">
              <input
                type="radio"
                name="entry-mode"
                value={m}
                checked={settings.entryMode === m}
                onChange={() => settings.entryMode !== m && onToggleEntry()}
              />
              <span>{m === "cell-first" ? t.cellFirst : t.digitFirst}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="settings-group">
        {TOGGLES.map(({ key, label, hint }) => (
          <label key={key} className="settings-row">
            <input type="checkbox" checked={settings[key]} onChange={() => toggle(key)} />
            <span>
              {label}
              <small className="settings-hint">{hint}</small>
            </span>
          </label>
        ))}
        <label className="settings-row">
          <input
            type="number"
            className="settings-number"
            min={0}
            max={MAX_IDLE_MINUTES}
            step={1}
            value={settings.idleMinutes}
            onChange={(e) => {
              const n = e.currentTarget.valueAsNumber;
              if (Number.isInteger(n)) onChange({ idleMinutes: n });
            }}
          />
          <span>
            {t.idleMinutes}
            <small className="settings-hint">{t.idleOff}</small>
          </span>
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="ctl dialog-confirm" autoFocus onClick={onClose}>
          {common.close}
        </button>
      </div>
    </dialog>
  );
}
