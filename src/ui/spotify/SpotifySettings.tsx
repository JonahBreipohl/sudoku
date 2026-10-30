import { useId, useState, useSyncExternalStore } from "react";
import type { Settings } from "../../state/settings";
import { beginLogin, loadTokens, redirectUriFor, saveTokens, subscribeTokens } from "./auth";
import { settings as t } from "../strings";

const CLIENT_ID = /^[A-Za-z0-9]{32}$/;

/** The Spotify group in Settings: the on/off switch, the owner's client ID, and sign-in. */
export function SpotifySettings({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  // Settings only accept a complete ID, so typing goes through a draft.
  const [draft, setDraft] = useState(settings.spotifyClientId);
  const connected = useSyncExternalStore(subscribeTokens, () => loadTokens() !== null, () => false);
  const hintId = useId();
  const invalid = draft !== "" && !CLIENT_ID.test(draft);
  const redirect = redirectUriFor(window.location);
  const isLocalhost = window.location.hostname === "localhost";

  return (
    <fieldset className="settings-group">
      <legend>{t.spotify}</legend>
      <label className="settings-row">
        <input type="checkbox" checked={settings.nowPlaying} onChange={() => onChange({ nowPlaying: !settings.nowPlaying })} />
        <span>
          {t.nowPlaying.label}
          <small className="settings-hint">{t.nowPlaying.hint}</small>
        </span>
      </label>
      <label className="settings-field">
        <span>{t.clientId}</span>
        <input
          type="text"
          className="settings-text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={hintId}
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            setDraft(v);
            if (v === "" || CLIENT_ID.test(v)) onChange({ spotifyClientId: v });
          }}
        />
      </label>
      <small id={hintId} className="settings-hint">
        {invalid ? (
          <strong>{t.clientIdInvalid}</strong>
        ) : (
          <>
            {t.clientIdHint} <code className="settings-code">{redirect}</code>
            {isLocalhost && <> {t.localhostNote}</>}
          </>
        )}
      </small>
      <div className="settings-actions">
        {connected ? (
          <>
            <span className="settings-hint">{t.connected}</span>
            <button type="button" className="ctl" onClick={() => saveTokens(null)}>
              {t.disconnect}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ctl"
            disabled={!settings.spotifyClientId}
            onClick={() => void beginLogin(settings.spotifyClientId, window.location.search)}
          >
            {t.connect}
          </button>
        )}
      </div>
    </fieldset>
  );
}
